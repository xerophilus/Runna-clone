/**
 * The Session Prescription Schema (spec §6).
 *
 * This is the contract between the rules engine and everything downstream
 * (display, logging, adaptation). It is a discriminated union on `type`.
 *
 * The engine OWNS the numbers in here. The LLM layer consumes a Prescription
 * and returns only `{ title, instructions, coaching_note }` — it must never
 * alter or restate these numbers as authoritative. The display layer renders
 * targets directly from the prescription.
 */

export type TargetKind = "pace" | "hr_zone" | "rpe" | "load";

/** A target is always a range, never a false-precision single number. */
export interface Target {
  kind: TargetKind;
  low: number;
  high: number;
  /** e.g. "sec_per_km", "bpm", "rpe", "kg", "pct_1rm" */
  unit: string;
}

export interface SegmentWork {
  measure: "distance" | "time";
  /** meters (for distance) or seconds (for time) */
  value: number;
  target: Target;
}

export interface Segment {
  /** e.g. 6 for "6 × 800m". Absent means a single continuous effort. */
  repeat?: number;
  work: SegmentWork;
  recovery?: { measure: "time" | "distance"; value: number };
}

export interface Block {
  /** "Warmup", "Main set", "Cooldown" */
  label: string;
  segments: Segment[];
}

export type RunIntent =
  | "easy"
  | "long"
  | "threshold"
  | "interval"
  | "repetition"
  | "recovery";

export interface RunPrescription {
  type: "run";
  intent: RunIntent;
  blocks: Block[];
  est_duration_s: number;
}

export interface StrengthExercise {
  name: string;
  sets: number;
  /** fixed reps or an inclusive [min, max] range */
  reps: number | [number, number];
  load: { kind: "pct_1rm" | "rpe"; low: number; high: number };
  rest_s: number;
}

export interface StrengthPrescription {
  type: "strength";
  focus: "lower" | "upper" | "full";
  exercises: StrengthExercise[];
  est_duration_s: number;
}

export interface RuckPrescription {
  type: "ruck";
  load_kg: number;
  distance_m: number;
  target_pace: { low: number; high: number; unit: "sec_per_km" };
  est_duration_s: number;
}

export interface CrossPrescription {
  type: "cross";
  /** free-form modality, e.g. "bike", "swim", "elliptical" */
  modality: string;
  target: { kind: "rpe" | "hr_zone"; low: number; high: number; unit: string };
  est_duration_s: number;
}

export interface RestPrescription {
  type: "rest";
  /** "full" rest day, or "active" recovery (mobility/walk) */
  mode: "full" | "active";
  est_duration_s: number;
}

export type Prescription =
  | RunPrescription
  | StrengthPrescription
  | RuckPrescription
  | CrossPrescription
  | RestPrescription;

export type SessionType = Prescription["type"];
