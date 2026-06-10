/**
 * LLM integration contracts (spec §7).
 *
 * The model is called ONLY from server-side Edge Functions. This module is the
 * shared, pure, testable contract layer: the schemas the model must conform to,
 * validators that run on every model output before it is trusted, the
 * number-drift guard (the engine owns the numbers), and the deterministic
 * fallbacks used when validation fails.
 *
 * Nothing here calls the network — it is the part of the LLM layer that must be
 * unit-tested. The actual Anthropic call lives in the Edge Function.
 */

import type { Prescription } from "../types/prescription.js";

// ---------------------------------------------------------------------------
// Task 1: session copywriting  (prescription → display copy)
// ---------------------------------------------------------------------------

export interface SessionCopy {
  title: string;
  instructions: string;
  coaching_note: string;
}

export type CopyResult =
  | { ok: true; copy: SessionCopy; source: "model" }
  | { ok: true; copy: SessionCopy; source: "fallback"; reason: string };

/** Validate the raw model output for session copywriting. */
export function validateSessionCopy(raw: unknown): SessionCopy | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.title !== "string" ||
    typeof o.instructions !== "string" ||
    typeof o.coaching_note !== "string"
  ) {
    return null;
  }
  if (!o.title.trim() || !o.instructions.trim()) return null;
  return {
    title: o.title.trim(),
    instructions: o.instructions.trim(),
    coaching_note: o.coaching_note.trim(),
  };
}

/**
 * Number-drift guard (spec §7 "Numbers are owned by the engine").
 *
 * Collect every authoritative figure from the prescription and confirm the
 * model's prose doesn't introduce a *different* pace/load/distance figure that
 * isn't in the prescription. We don't require the copy to restate the numbers;
 * we only reject copy that invents conflicting ones.
 */
export function copyHasNumberDrift(copy: SessionCopy, prescription: Prescription): boolean {
  const allowed = authoritativeNumbers(prescription);
  const text = `${copy.title} ${copy.instructions} ${copy.coaching_note}`;
  // Pull integer-ish figures the model might assert as targets.
  const figures = text.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const f of figures) {
    const n = Number(f);
    // ignore tiny incidental numbers (rep counts, "2 sentences", days, etc.)
    if (n <= 12) continue;
    if (!allowed.has(Math.round(n))) return true;
  }
  return false;
}

function authoritativeNumbers(p: Prescription): Set<number> {
  const nums = new Set<number>();
  const add = (n: number) => {
    nums.add(Math.round(n));
    // allow common unit conversions the copy might use
    nums.add(Math.round(n / 1000)); // m → km
    nums.add(Math.round(n / 60)); // s → min
  };
  if (p.type === "run") {
    add(p.est_duration_s);
    for (const b of p.blocks)
      for (const s of b.segments) {
        add(s.work.value);
        add(s.work.target.low);
        add(s.work.target.high);
        if (s.repeat) nums.add(s.repeat);
        if (s.recovery) add(s.recovery.value);
      }
  } else if (p.type === "strength") {
    add(p.est_duration_s);
    for (const e of p.exercises) {
      nums.add(e.sets);
      add(e.load.low);
      add(e.load.high);
    }
  } else if (p.type === "ruck") {
    add(p.est_duration_s);
    add(p.distance_m);
    add(p.load_kg);
    add(p.target_pace.low);
    add(p.target_pace.high);
  } else if (p.type === "cross") {
    add(p.est_duration_s);
  }
  return nums;
}

/** Deterministic templated copy used when the model output can't be trusted. */
export function templateCopy(p: Prescription): SessionCopy {
  switch (p.type) {
    case "run": {
      const km = Math.round(runDistanceM(p) / 100) / 10;
      const titles: Record<string, string> = {
        easy: "Easy Run",
        long: "Long Run",
        recovery: "Recovery Run",
        threshold: "Threshold Run",
        interval: "Interval Session",
        repetition: "Repetition Session",
      };
      return {
        title: titles[p.intent] ?? "Run",
        instructions: `${km} km total. Follow the prescribed blocks and hold the target paces shown.`,
        coaching_note: "Keep easy portions truly easy; the work happens in the main set.",
      };
    }
    case "strength":
      return {
        title: `Strength — ${p.focus}`,
        instructions: "Complete each exercise for the prescribed sets and reps at the target load.",
        coaching_note: "Leave a rep or two in reserve unless a set is marked heavy.",
      };
    case "ruck":
      return {
        title: "Ruck",
        instructions: "Cover the prescribed distance under load at the target pace.",
        coaching_note: "Posture tall, short steps on the climbs.",
      };
    case "cross":
      return {
        title: `Cross-training — ${p.modality}`,
        instructions: "Hold the target effort for the prescribed duration.",
        coaching_note: "This is aerobic support; keep it controlled.",
      };
    case "rest":
      return {
        title: p.mode === "active" ? "Active Recovery" : "Rest Day",
        instructions: p.mode === "active" ? "Light mobility or an easy walk." : "Full rest. Let the work absorb.",
        coaching_note: "Recovery is where adaptation happens.",
      };
  }
}

function runDistanceM(p: Extract<Prescription, { type: "run" }>): number {
  let t = 0;
  for (const b of p.blocks)
    for (const s of b.segments)
      if (s.work.measure === "distance") t += (s.repeat ?? 1) * s.work.value;
  return t;
}

/** Apply the full guard pipeline to a raw model response. */
export function finalizeCopy(raw: unknown, prescription: Prescription): CopyResult {
  const validated = validateSessionCopy(raw);
  if (!validated) {
    return { ok: true, copy: templateCopy(prescription), source: "fallback", reason: "schema" };
  }
  if (copyHasNumberDrift(validated, prescription)) {
    return { ok: true, copy: templateCopy(prescription), source: "fallback", reason: "number_drift" };
  }
  return { ok: true, copy: validated, source: "model" };
}

// ---------------------------------------------------------------------------
// Task 2: natural-language adjustment parsing (free text → structured)
// ---------------------------------------------------------------------------

export type Adjustment =
  | { adjustment: "shift_long_run"; to_day: string }
  | { adjustment: "increase_hill_volume"; magnitude: "slight" | "moderate" | "large" }
  | { adjustment: "reduce_volume"; magnitude: "slight" | "moderate" | "large" }
  | { adjustment: "travel_week"; week_index: number }
  | { adjustment: "ease_goal_pace"; magnitude: "slight" | "moderate" | "large" }
  | { adjustment: "clarify"; question: string };

const MAGNITUDES = new Set(["slight", "moderate", "large"]);
const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

/** Validate the model's parsed adjustment object. Returns null if malformed. */
export function validateAdjustment(raw: unknown): Adjustment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  switch (o.adjustment) {
    case "shift_long_run":
      return typeof o.to_day === "string" && WEEKDAYS.has(o.to_day)
        ? { adjustment: "shift_long_run", to_day: o.to_day }
        : null;
    case "increase_hill_volume":
    case "reduce_volume":
    case "ease_goal_pace":
      return typeof o.magnitude === "string" && MAGNITUDES.has(o.magnitude)
        ? ({ adjustment: o.adjustment, magnitude: o.magnitude } as Adjustment)
        : null;
    case "travel_week":
      return typeof o.week_index === "number" && Number.isInteger(o.week_index) && o.week_index >= 0
        ? { adjustment: "travel_week", week_index: o.week_index }
        : null;
    case "clarify":
      return typeof o.question === "string" && o.question.trim().length > 0
        ? { adjustment: "clarify", question: o.question.trim() }
        : null;
    default:
      return null;
  }
}

/** Map a validated adjustment to the engine's reflow parameters (spec §3). */
export function adjustmentToReflow(adj: Adjustment): {
  vdotDelta?: number;
  volumeScale?: number;
} | null {
  switch (adj.adjustment) {
    case "reduce_volume": {
      const scale = adj.magnitude === "slight" ? 0.92 : adj.magnitude === "moderate" ? 0.85 : 0.75;
      return { volumeScale: scale };
    }
    case "ease_goal_pace": {
      const delta = adj.magnitude === "slight" ? -1 : adj.magnitude === "moderate" ? -2 : -3;
      return { vdotDelta: delta };
    }
    case "shift_long_run":
    case "increase_hill_volume":
    case "travel_week":
      // handled by structural reflow paths, not a volume/vdot tweak
      return {};
    case "clarify":
      return null;
  }
}
