/**
 * Core domain model (spec §4).
 *
 * These mirror the Supabase/Postgres tables but are the in-memory shapes the
 * rules engine produces and consumes. Persistence maps these onto rows; the
 * jsonb columns hold the structured sub-objects (prescription, target_volume,
 * fitness_baseline, etc.).
 */

import type { Prescription, SessionType } from "./prescription";

export type Units = "metric" | "imperial";

// ---------------------------------------------------------------------------
// Fitness model (spec §4 "Fitness model")
// ---------------------------------------------------------------------------

export interface LiftMaxes {
  /** estimated 1RM in kg for the primary lifts the plan uses */
  squat?: number;
  deadlift?: number;
  press?: number;
  pull?: number;
}

export interface RuckBaseline {
  /** habitual ruck pace in sec_per_km */
  pace: number;
  /** habitual / comfortable ruck load in kg */
  load: number;
}

export interface FitnessBaseline {
  /** Daniels VDOT-equivalent. May be undefined at cold-start (estimated later). */
  vdot?: number;
  lifts?: LiftMaxes;
  ruck?: RuckBaseline;
  /** current weekly run volume in meters, used to seed starting volume */
  current_weekly_run_m?: number;
}

// ---------------------------------------------------------------------------
// Availability (spec §4 users.availability)
// ---------------------------------------------------------------------------

export type Weekday =
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"
  | "sun";

export type Equipment = "none" | "dumbbells" | "full_gym" | "rucksack";

export interface Availability {
  days_per_week: number;
  /** preferred training days, ordered; the longest-available day hosts long runs */
  day_prefs: Weekday[];
  /** the user's single longest available day (for long runs); defaults to last day_pref */
  long_day?: Weekday;
  minutes_per_session: number;
  equipment: Equipment[];
}

// ---------------------------------------------------------------------------
// Goal (spec §4 goals)
// ---------------------------------------------------------------------------

export type GoalType = "race" | "standard" | "maintenance";

export interface RaceDetail {
  /** race distance in meters (e.g. 5000, 10000, 21097, 42195) */
  distance: number;
  /** optional target finish time in seconds */
  target_time?: number;
}

export interface StandardDetail {
  /** e.g. "navy_prt" */
  name: string;
  /** opaque threshold map for the standard, e.g. { run_1_5mi: 690, pushups: 50 } */
  thresholds: Record<string, number>;
}

export type MaintenanceEmphasis = "run_lean" | "balanced" | "strength_lean";

export interface MaintenanceDetail {
  emphasis: MaintenanceEmphasis;
}

export interface Goal {
  id: string;
  type: GoalType;
  detail: RaceDetail | StandardDetail | MaintenanceDetail;
  /** ISO date (YYYY-MM-DD); null for maintenance */
  goal_date: string | null;
  status: "active" | "completed" | "archived";
}

// ---------------------------------------------------------------------------
// Plan / Week / Session (spec §4)
// ---------------------------------------------------------------------------

export type Phase = "base" | "build" | "peak" | "taper" | "maintenance";

export interface PhaseSpan {
  phase: Phase;
  week_count: number;
}

export interface TargetVolume {
  /** target run distance for the week in meters */
  run_distance: number;
  /** target run time for the week in seconds */
  run_time: number;
  strength_sessions: number;
  /** target ruck distance for the week in meters */
  ruck_distance: number;
}

export type SessionStatus = "scheduled" | "completed" | "skipped" | "modified";
export type EffortFlag = "easy" | "ok" | "hard" | "failed";

export interface SessionDisplay {
  title: string;
  instructions: string;
  coaching_note: string;
}

export interface Session {
  id: string;
  week_id: string;
  plan_id: string;
  type: SessionType;
  /** ISO date (YYYY-MM-DD) */
  scheduled_date: string;
  prescription: Prescription;
  /** LLM-generated copy, cached; null until generated */
  display: SessionDisplay | null;
  status: SessionStatus;
  effort_flag: EffortFlag | null;
}

export interface Week {
  id: string;
  plan_id: string;
  /** 0-based index from plan start */
  week_index: number;
  phase: Phase;
  target_volume: TargetVolume;
  is_deload: boolean;
  sessions: Session[];
}

export interface Plan {
  id: string;
  user_id: string;
  goal_id: string;
  /** ISO date */
  start_date: string;
  /** ISO date */
  end_date: string;
  phase_structure: PhaseSpan[];
  status: "active" | "completed" | "superseded";
  /** incremented each time the plan is regenerated (adaptation) */
  version: number;
  weeks: Week[];
}

// ---------------------------------------------------------------------------
// Activity / Adaptation (spec §4)
// ---------------------------------------------------------------------------

export interface ActivityMetrics {
  distance?: number;
  avg_pace?: number;
  avg_hr?: number;
  max_hr?: number;
  elevation?: number;
  /** strength tonnage (sets×reps×load) when applicable */
  load_volume?: number;
}

export interface Activity {
  id: string;
  user_id: string;
  session_id: string | null;
  source: "manual" | "healthkit";
  type: SessionType;
  /** ISO datetime */
  started_at: string;
  duration_s: number;
  metrics: ActivityMetrics;
  rpe: number | null;
}

export type AdaptationTrigger =
  | "missed_sessions"
  | "underperformance"
  | "manual_fatigue"
  | "user_request";

export interface Adaptation {
  id: string;
  plan_id: string;
  /** ISO datetime */
  triggered_at: string;
  trigger: AdaptationTrigger;
  /** LLM-generated human-facing rationale describing the deterministic diff */
  summary: string;
  /** structured diff of what moved/changed */
  changes: PlanDiff;
}

// ---------------------------------------------------------------------------
// Plan diff (output of comparing two plan versions during adaptation)
// ---------------------------------------------------------------------------

export interface WeekVolumeDelta {
  week_index: number;
  before: TargetVolume;
  after: TargetVolume;
}

export interface PlanDiff {
  goal_date_changed: boolean;
  goal_date_before: string | null;
  goal_date_after: string | null;
  vdot_before?: number;
  vdot_after?: number;
  phase_structure_before: PhaseSpan[];
  phase_structure_after: PhaseSpan[];
  weeks_changed: WeekVolumeDelta[];
  /** whether the change is large enough to require explicit user consent */
  requires_consent: boolean;
}
