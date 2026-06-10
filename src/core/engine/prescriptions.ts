/**
 * Prescription construction (spec §5.2 step 5, §6).
 *
 * Pure builders that turn engine-derived targets (paces, loads, distances) into
 * the structured Prescription objects defined in §6. No prose here — copy is the
 * LLM layer's job. The numbers are owned here and are authoritative.
 */

import type {
  Block,
  RunIntent,
  RunPrescription,
  StrengthExercise,
  StrengthPrescription,
  RuckPrescription,
  RestPrescription,
} from "../types/prescription.js";
import type { Equipment, LiftMaxes } from "../types/domain.js";
import type { TrainingPaces, PaceRange } from "./vdot.js";
import { midPace } from "./vdot.js";

const WARMUP_M = 1600;
const COOLDOWN_M = 1200;

function durationForDistance(distanceM: number, pace: PaceRange): number {
  return Math.round((distanceM / 1000) * midPace(pace));
}

function paceTarget(pace: PaceRange) {
  return { kind: "pace" as const, low: pace.low, high: pace.high, unit: "sec_per_km" };
}

function continuousRunBlock(label: string, distanceM: number, pace: PaceRange): Block {
  return {
    label,
    segments: [
      { work: { measure: "distance", value: distanceM, target: paceTarget(pace) } },
    ],
  };
}

/** Easy or long continuous run. */
export function buildEasyRun(
  distanceM: number,
  paces: TrainingPaces,
  intent: Extract<RunIntent, "easy" | "long" | "recovery">,
): RunPrescription {
  const pace = intent === "recovery" ? paces.easy : paces.easy;
  return {
    type: "run",
    intent,
    blocks: [continuousRunBlock(intent === "long" ? "Long run" : "Run", distanceM, pace)],
    est_duration_s: durationForDistance(distanceM, pace),
  };
}

/**
 * Threshold (tempo) session: warmup + a threshold block + cooldown.
 * The threshold block is a single continuous effort sized to the remaining
 * distance after warmup/cooldown, capped to a sensible tempo length.
 */
export function buildThresholdRun(
  totalDistanceM: number,
  paces: TrainingPaces,
): RunPrescription {
  const tempoM = clamp(totalDistanceM - WARMUP_M - COOLDOWN_M, 3000, 10000);
  const blocks: Block[] = [
    continuousRunBlock("Warmup", WARMUP_M, paces.easy),
    {
      label: "Main set",
      segments: [
        { work: { measure: "distance", value: tempoM, target: paceTarget(paces.threshold) } },
      ],
    },
    continuousRunBlock("Cooldown", COOLDOWN_M, paces.easy),
  ];
  const est =
    durationForDistance(WARMUP_M, paces.easy) +
    durationForDistance(tempoM, paces.threshold) +
    durationForDistance(COOLDOWN_M, paces.easy);
  return { type: "run", intent: "threshold", blocks, est_duration_s: est };
}

/**
 * Interval session: warmup + N × repDistance @ interval pace (with recovery) +
 * cooldown. Rep count is sized from the total volume budget.
 */
export function buildIntervalRun(
  totalDistanceM: number,
  paces: TrainingPaces,
  opts: { repDistanceM?: number; recoverySec?: number } = {},
): RunPrescription {
  const repDistanceM = opts.repDistanceM ?? 800;
  const recoverySec = opts.recoverySec ?? 150;
  const workBudget = clamp(totalDistanceM - WARMUP_M - COOLDOWN_M, repDistanceM, 6000);
  const reps = Math.max(3, Math.round(workBudget / repDistanceM));

  const blocks: Block[] = [
    continuousRunBlock("Warmup", WARMUP_M, paces.easy),
    {
      label: "Main set",
      segments: [
        {
          repeat: reps,
          work: { measure: "distance", value: repDistanceM, target: paceTarget(paces.interval) },
          recovery: { measure: "time", value: recoverySec },
        },
      ],
    },
    continuousRunBlock("Cooldown", COOLDOWN_M, paces.easy),
  ];
  const est =
    durationForDistance(WARMUP_M, paces.easy) +
    reps * (durationForDistance(repDistanceM, paces.interval) + recoverySec) +
    durationForDistance(COOLDOWN_M, paces.easy);
  return { type: "run", intent: "interval", blocks, est_duration_s: est };
}

// ---------------------------------------------------------------------------
// Strength
// ---------------------------------------------------------------------------

const HAS_BARBELL_LIFTS: Record<string, keyof LiftMaxes> = {
  "Back Squat": "squat",
  Deadlift: "deadlift",
  "Overhead Press": "press",
  "Pull-up": "pull",
};

/**
 * Build a strength session. If 1RM data exists, prescribe %1RM; otherwise fall
 * back to RPE (spec §4 strength model: back-fill 1RM from logged sets later).
 */
export function buildStrengthSession(
  focus: StrengthPrescription["focus"],
  equipment: Equipment[],
  lifts: LiftMaxes | undefined,
  opts: { intensity?: "moderate" | "heavy"; minutes?: number } = {},
): StrengthPrescription {
  const heavy = opts.intensity === "heavy";
  const hasGym = equipment.includes("full_gym");
  const hasDumbbells = hasGym || equipment.includes("dumbbells");

  const movements = selectMovements(focus, hasGym, hasDumbbells);
  const exercises: StrengthExercise[] = movements.map((name) => {
    const liftKey = HAS_BARBELL_LIFTS[name];
    const has1rm = liftKey && lifts?.[liftKey] != null;
    const load = has1rm
      ? { kind: "pct_1rm" as const, low: heavy ? 80 : 68, high: heavy ? 87 : 75 }
      : { kind: "rpe" as const, low: heavy ? 7 : 6, high: heavy ? 9 : 8 };
    return {
      name,
      sets: heavy ? 5 : 3,
      reps: heavy ? ([3, 5] as [number, number]) : ([8, 12] as [number, number]),
      load,
      rest_s: heavy ? 180 : 90,
    };
  });

  const est = exercises.reduce(
    (acc, e) => acc + e.sets * (e.rest_s + 40),
    300, // warmup
  );
  return { type: "strength", focus, exercises, est_duration_s: est };
}

function selectMovements(
  focus: StrengthPrescription["focus"],
  hasGym: boolean,
  hasDumbbells: boolean,
): string[] {
  if (focus === "lower") {
    if (hasGym) return ["Back Squat", "Deadlift", "Walking Lunge", "Calf Raise"];
    if (hasDumbbells) return ["Goblet Squat", "DB Romanian Deadlift", "Reverse Lunge", "Calf Raise"];
    return ["Bodyweight Squat", "Single-leg Glute Bridge", "Split Squat", "Calf Raise"];
  }
  if (focus === "upper") {
    if (hasGym) return ["Overhead Press", "Pull-up", "Bench Press", "Barbell Row"];
    if (hasDumbbells) return ["DB Shoulder Press", "DB Row", "DB Bench Press", "DB Curl"];
    return ["Push-up", "Inverted Row", "Pike Push-up", "Superman Hold"];
  }
  // full
  if (hasGym) return ["Back Squat", "Overhead Press", "Pull-up", "Plank"];
  if (hasDumbbells) return ["Goblet Squat", "DB Shoulder Press", "DB Row", "Plank"];
  return ["Bodyweight Squat", "Push-up", "Inverted Row", "Plank"];
}

// ---------------------------------------------------------------------------
// Ruck
// ---------------------------------------------------------------------------

export function buildRuckSession(
  distanceM: number,
  loadKg: number,
  paceSecPerKm: { low: number; high: number },
): RuckPrescription {
  const midPaceSecPerKm = Math.round((paceSecPerKm.low + paceSecPerKm.high) / 2);
  return {
    type: "ruck",
    load_kg: loadKg,
    distance_m: distanceM,
    target_pace: { low: paceSecPerKm.low, high: paceSecPerKm.high, unit: "sec_per_km" },
    est_duration_s: Math.round((distanceM / 1000) * midPaceSecPerKm),
  };
}

export function buildRest(mode: RestPrescription["mode"] = "full"): RestPrescription {
  return { type: "rest", mode, est_duration_s: 0 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
