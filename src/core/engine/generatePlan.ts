/**
 * Plan generation orchestrator (spec §5.2).
 *
 * Layer 1 — the deterministic rules engine. Given a goal + baseline +
 * availability, it produces a complete Plan → Weeks → Sessions with fully
 * structured prescriptions and NO LLM involvement. The output is idempotent for
 * the same inputs and ENGINE_VERSION, so it can be re-run and diffed during
 * adaptation.
 *
 * Layer 2 (LLM session copywriting) runs afterwards and only fills in
 * `session.display`; it never touches the numbers produced here.
 */

import type {
  Availability,
  FitnessBaseline,
  Goal,
  Phase,
  PhaseSpan,
  Plan,
  Session,
  Week,
  Weekday,
  RaceDetail,
  TargetVolume,
} from "../types/domain";
import type { Prescription } from "../types/prescription";
import { DEFAULT_CONFIG, ENGINE_VERSION, type EngineConfig } from "./config";
import { pacesFromVdot, type TrainingPaces } from "./vdot";
import { allocateMaintenancePhases, allocateRacePhases } from "./phases";
import { buildVolumeProgression, type WeekVolumePlan } from "./volume";
import { scheduleWeek, WEEK_ORDER, type SessionSlot } from "./scheduling";
import {
  buildEasyRun,
  buildIntervalRun,
  buildRest,
  buildRuckSession,
  buildStrengthSession,
  buildThresholdRun,
} from "./prescriptions";
import { addDays, mondayOnOrBefore } from "./dates";

/** Cold-start VDOT when the user provides no fitness data (deliberately low). */
export const COLD_START_VDOT = 38;
/** Default starting weekly run volume (meters) when none is reported. */
export const DEFAULT_START_WEEKLY_RUN_M = 20_000;
/** Default horizon for maintenance plans (no goal date). */
export const DEFAULT_MAINTENANCE_WEEKS = 12;

export interface HybridScope {
  includeStrength: boolean;
  strengthPerWeek: number;
  includeRuck: boolean;
  ruckPerWeek: number;
}

export interface GeneratePlanInput {
  planId: string;
  userId: string;
  goal: Goal;
  baseline: FitnessBaseline;
  availability: Availability;
  /** ISO date the plan begins; snapped to the Monday on/before it. */
  startDate: string;
  config?: EngineConfig;
  hybrid?: HybridScope;
  /** override the maintenance horizon */
  maintenanceWeeks?: number;
}

const DEFAULT_HYBRID: HybridScope = {
  includeStrength: false,
  strengthPerWeek: 0,
  includeRuck: false,
  ruckPerWeek: 0,
};

export function generatePlan(input: GeneratePlanInput): Plan {
  const config = input.config ?? DEFAULT_CONFIG;
  const hybrid = input.hybrid ?? DEFAULT_HYBRID;
  const startDate = mondayOnOrBefore(input.startDate);

  const vdot = resolveVdot(input.baseline);
  const paces = pacesFromVdot(vdot, config);

  const { phaseStructure, weekCount } = planPhases(input, startDate, config);
  const startWeeklyRunM =
    input.baseline.current_weekly_run_m ?? DEFAULT_START_WEEKLY_RUN_M;
  const volume = buildVolumeProgression(phaseStructure, startWeeklyRunM, config);

  const longDay = resolveLongDay(input.availability);

  const weeks: Week[] = volume.map((vp) =>
    buildWeek(vp, input, config, hybrid, paces, longDay, startDate),
  );

  const endDate = addDays(startDate, weekCount * 7 - 1);

  return {
    id: input.planId,
    user_id: input.userId,
    goal_id: input.goal.id,
    start_date: startDate,
    end_date: endDate,
    phase_structure: phaseStructure,
    status: "active",
    version: 1,
    weeks,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function resolveVdot(baseline: FitnessBaseline): number {
  return baseline.vdot ?? COLD_START_VDOT;
}

function resolveLongDay(availability: Availability): Weekday {
  if (availability.long_day) return availability.long_day;
  const prefs = availability.day_prefs;
  return prefs.length > 0 ? prefs[prefs.length - 1]! : "sun";
}

function planPhases(
  input: GeneratePlanInput,
  startDate: string,
  config: EngineConfig,
): { phaseStructure: PhaseSpan[]; weekCount: number } {
  if (input.goal.type === "maintenance" || !input.goal.goal_date) {
    const weeks = input.maintenanceWeeks ?? DEFAULT_MAINTENANCE_WEEKS;
    return { phaseStructure: allocateMaintenancePhases(weeks), weekCount: weeks };
  }
  const weeks = weeksBetween(startDate, input.goal.goal_date);
  const distance = raceDistance(input.goal);
  return {
    phaseStructure: allocateRacePhases(weeks, distance, config),
    weekCount: weeks,
  };
}

function weeksBetween(startIso: string, goalIso: string): number {
  const start = mondayOnOrBefore(startIso);
  const ms = new Date(goalIso).getTime() - new Date(start).getTime();
  const days = Math.round(ms / 86_400_000);
  return Math.max(1, Math.ceil(days / 7));
}

function raceDistance(goal: Goal): number {
  if (goal.type === "race") return (goal.detail as RaceDetail).distance;
  // standards default to a 5k-equivalent taper profile
  return 5000;
}

const availableDaysOf = (availability: Availability): Weekday[] => {
  const prefs = availability.day_prefs.slice(0, availability.days_per_week);
  return prefs.length > 0 ? prefs : WEEK_ORDER.slice(0, availability.days_per_week);
};

function buildWeek(
  vp: WeekVolumePlan,
  input: GeneratePlanInput,
  config: EngineConfig,
  hybrid: HybridScope,
  paces: TrainingPaces,
  longDay: Weekday,
  startDate: string,
): Week {
  const weekId = `${input.planId}:w${vp.week_index}`;
  const availableDays = availableDaysOf(input.availability);

  const strengthSessions =
    hybrid.includeStrength && !vp.is_deload
      ? hybrid.strengthPerWeek
      : hybrid.includeStrength
        ? Math.max(0, hybrid.strengthPerWeek - 1)
        : 0;
  const ruckSessions = hybrid.includeRuck ? hybrid.ruckPerWeek : 0;

  const slots = scheduleWeek({
    phase: vp.phase,
    isDeload: vp.is_deload,
    availableDays,
    longDay,
    strengthSessions,
    ruckSessions,
  });

  const sessions = assignPrescriptions(
    slots,
    vp,
    input,
    config,
    hybrid,
    paces,
    weekId,
    startDate,
  );

  const target_volume = summariseVolume(vp, sessions);

  return {
    id: weekId,
    plan_id: input.planId,
    week_index: vp.week_index,
    phase: vp.phase,
    target_volume,
    is_deload: vp.is_deload,
    sessions,
  };
}

function assignPrescriptions(
  slots: SessionSlot[],
  vp: WeekVolumePlan,
  input: GeneratePlanInput,
  config: EngineConfig,
  hybrid: HybridScope,
  paces: TrainingPaces,
  weekId: string,
  startDate: string,
): Session[] {
  const V = vp.run_distance_m;
  const longRunM = Math.round(V * config.longRunFraction);

  // Easy-run budget = whatever run volume is left after long + quality.
  const qualitySlots = slots.filter(
    (s) => s.kind === "quality_threshold" || s.kind === "quality_interval",
  );
  const qualityBudget = Math.round(V * 0.22);
  const easySlots = slots.filter((s) => s.kind === "easy");
  const usedByQuality = qualitySlots.length * Math.min(qualityBudget, V * 0.25);
  const easyRemaining = Math.max(0, V - longRunM - usedByQuality);
  const easyEach = easySlots.length > 0 ? Math.max(3000, Math.round(easyRemaining / easySlots.length)) : 0;

  return slots.map((slot, idx) => {
    const scheduled_date = dateForSlot(startDate, vp.week_index, slot.weekday);
    const prescription = prescriptionForSlot(
      slot,
      { V, longRunM, qualityBudget, easyEach },
      input,
      hybrid,
      paces,
      vp,
    );
    const session: Session = {
      id: `${weekId}:${slot.weekday}:${idx}`,
      week_id: weekId,
      plan_id: input.planId,
      type: prescription.type,
      scheduled_date,
      prescription,
      display: null,
      status: "scheduled",
      effort_flag: null,
    };
    return session;
  });
}

interface RunBudgets {
  V: number;
  longRunM: number;
  qualityBudget: number;
  easyEach: number;
}

function prescriptionForSlot(
  slot: SessionSlot,
  budgets: RunBudgets,
  input: GeneratePlanInput,
  hybrid: HybridScope,
  paces: TrainingPaces,
  vp: WeekVolumePlan,
): Prescription {
  switch (slot.kind) {
    case "long":
      return buildEasyRun(budgets.longRunM, paces, "long");
    case "easy":
      return buildEasyRun(budgets.easyEach, paces, "easy");
    case "quality_threshold":
      return buildThresholdRun(budgets.qualityBudget, paces);
    case "quality_interval":
      return buildIntervalRun(budgets.qualityBudget, paces);
    case "strength": {
      const focus = vp.week_index % 2 === 0 ? "lower" : "upper";
      return buildStrengthSession(focus, input.availability.equipment, input.baseline.lifts, {
        intensity: vp.phase === "peak" ? "heavy" : "moderate",
        minutes: input.availability.minutes_per_session,
      });
    }
    case "ruck": {
      const loadKg = input.baseline.ruck?.load ?? 15;
      const basePace = input.baseline.ruck?.pace ?? 480;
      const ruckM = clamp(Math.round(budgets.V * 0.4), 4000, 12000);
      return buildRuckSession(ruckM, loadKg, { low: basePace - 20, high: basePace + 20 });
    }
    case "rest":
      return buildRest("full");
  }
}

function dateForSlot(startDate: string, weekIndex: number, weekday: Weekday): string {
  const dayOffset = WEEK_ORDER.indexOf(weekday);
  return addDays(startDate, weekIndex * 7 + dayOffset);
}

function summariseVolume(vp: WeekVolumePlan, sessions: Session[]): TargetVolume {
  let run_distance = 0;
  let run_time = 0;
  let strength_sessions = 0;
  let ruck_distance = 0;
  for (const s of sessions) {
    const p = s.prescription;
    if (p.type === "run") {
      run_distance += sumRunDistance(p);
      run_time += p.est_duration_s;
    } else if (p.type === "strength") {
      strength_sessions += 1;
    } else if (p.type === "ruck") {
      ruck_distance += p.distance_m;
    }
  }
  return { run_distance, run_time, strength_sessions, ruck_distance };
}

function sumRunDistance(p: Extract<Prescription, { type: "run" }>): number {
  let total = 0;
  for (const block of p.blocks) {
    for (const seg of block.segments) {
      const reps = seg.repeat ?? 1;
      if (seg.work.measure === "distance") total += reps * seg.work.value;
    }
  }
  return total;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export const __engineMeta = { ENGINE_VERSION };
export type { Phase };
