/**
 * Display formatting (spec §5.3).
 *
 * The engine is metric internally (meters, sec/km); this layer converts to the
 * user's units. Targets always render as ranges, never false-precision points.
 */

import type { Units } from "../core/types/domain";
import type {
  Prescription,
  RunPrescription,
  Segment,
  StrengthExercise,
  Target,
} from "../core/types/prescription";

const KM_PER_MI = 1.609344;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "5:07" from seconds-per-unit. */
export function clock(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s % 60)}`;
  return `${m}:${pad2(s % 60)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export function formatDistance(meters: number, units: Units): string {
  if (units === "imperial") {
    const mi = meters / 1000 / KM_PER_MI;
    return `${mi >= 10 ? mi.toFixed(0) : mi.toFixed(1)} mi`;
  }
  const km = meters / 1000;
  return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`;
}

/** Pace range like "8:10–8:35 /mi" from a sec_per_km target. */
export function formatPaceRange(low: number, high: number, units: Units): string {
  const f = units === "imperial" ? KM_PER_MI : 1;
  const suffix = units === "imperial" ? "/mi" : "/km";
  return `${clock(low * f)}–${clock(high * f)} ${suffix}`;
}

export function formatLoadKg(kg: number, units: Units): string {
  if (units === "imperial") return `${Math.round(kg * 2.20462)} lb`;
  return `${Math.round(kg)} kg`;
}

function formatTarget(target: Target, units: Units): string {
  switch (target.kind) {
    case "pace":
      return formatPaceRange(target.low, target.high, units);
    case "hr_zone":
      return `${Math.round(target.low)}–${Math.round(target.high)} bpm`;
    case "rpe":
      return `RPE ${target.low}–${target.high}`;
    case "load":
      return `${target.low}–${target.high} ${target.unit}`;
  }
}

function formatWorkAmount(measure: "distance" | "time", value: number, units: Units): string {
  if (measure === "time") return formatDuration(value);
  // Render interval reps in meters when short, distance units when long.
  if (value < 3000 && units === "metric") return `${value} m`;
  return formatDistance(value, units);
}

/** "6 × 800 m @ 3:50–4:00 /km · 2:30 recovery" */
export function describeSegment(seg: Segment, units: Units): string {
  const work = formatWorkAmount(seg.work.measure, seg.work.value, units);
  const head = seg.repeat && seg.repeat > 1 ? `${seg.repeat} × ${work}` : work;
  let out = `${head} @ ${formatTarget(seg.work.target, units)}`;
  if (seg.recovery) {
    const rec =
      seg.recovery.measure === "time"
        ? clock(seg.recovery.value)
        : formatWorkAmount("distance", seg.recovery.value, units);
    out += ` · ${rec} recovery`;
  }
  return out;
}

/** "Back Squat — 5 × 3–5 @ 80–87% 1RM · rest 3:00" */
export function describeExercise(ex: StrengthExercise, units: Units): string {
  const reps = Array.isArray(ex.reps) ? `${ex.reps[0]}–${ex.reps[1]}` : String(ex.reps);
  const load =
    ex.load.kind === "pct_1rm"
      ? `${ex.load.low}–${ex.load.high}% 1RM`
      : `RPE ${ex.load.low}–${ex.load.high}`;
  return `${ex.sets} × ${reps} @ ${load} · rest ${clock(ex.rest_s)}`;
}

export function runTotalDistance(p: RunPrescription): number {
  let total = 0;
  for (const block of p.blocks) {
    for (const seg of block.segments) {
      if (seg.work.measure === "distance") total += (seg.repeat ?? 1) * seg.work.value;
    }
  }
  return total;
}

const RUN_INTENT_LABEL: Record<RunPrescription["intent"], string> = {
  easy: "Easy Run",
  long: "Long Run",
  recovery: "Recovery Run",
  threshold: "Threshold Run",
  interval: "Interval Session",
  repetition: "Repetition Session",
};

export function sessionTitle(p: Prescription): string {
  switch (p.type) {
    case "run":
      return RUN_INTENT_LABEL[p.intent];
    case "strength":
      return `Strength · ${p.focus === "full" ? "Full body" : p.focus === "lower" ? "Lower" : "Upper"}`;
    case "ruck":
      return "Ruck";
    case "cross":
      return `Cross · ${p.modality}`;
    case "rest":
      return p.mode === "active" ? "Active Recovery" : "Rest Day";
  }
}

/** One-line summary for the today card / week list. */
export function sessionSummary(p: Prescription, units: Units): string {
  switch (p.type) {
    case "run": {
      const main = p.blocks.find((b) => b.label === "Main set");
      const seg = main?.segments[0];
      if (seg && (seg.repeat ?? 1) > 1) return describeSegment(seg, units);
      return `${formatDistance(runTotalDistance(p), units)} @ ${formatTarget(
        (seg ?? p.blocks[0]!.segments[0]!).work.target,
        units,
      )}`;
    }
    case "strength":
      return `${p.exercises.length} exercises · ~${formatDuration(p.est_duration_s)}`;
    case "ruck":
      return `${formatDistance(p.distance_m, units)} @ ${formatLoadKg(p.load_kg, units)} load`;
    case "cross":
      return `${formatDuration(p.est_duration_s)} ${p.modality}`;
    case "rest":
      return p.mode === "active" ? "Mobility or an easy walk" : "Full rest — let the work absorb";
  }
}

export const SESSION_ICON: Record<Prescription["type"], string> = {
  run: "walk",
  strength: "barbell",
  ruck: "trail-sign",
  cross: "bicycle",
  rest: "moon",
};

/** Local-timezone today as YYYY-MM-DD (plan dates are calendar dates). */
export function localTodayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function formatDateLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y!, (m ?? 1) - 1, d ?? 1);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
