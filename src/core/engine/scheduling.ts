/**
 * Session scheduling (spec §5.2 step 3).
 *
 * Distribute a week's sessions across the user's available days while protecting
 * the load-bearing constraints:
 *   - the long run goes on the user's longest available day,
 *   - hard (quality) sessions never land back-to-back,
 *   - strength is slotted so it doesn't sit the day before a key run quality day,
 *   - leftover available days become easy runs, then rest.
 *
 * Deterministic: same inputs → same day assignment.
 */

import type { Phase, Weekday } from "../types/domain";

export const WEEK_ORDER: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type SlotKind =
  | "long"
  | "quality_threshold"
  | "quality_interval"
  | "easy"
  | "strength"
  | "ruck"
  | "rest";

export interface SessionSlot {
  weekday: Weekday;
  kind: SlotKind;
}

const HARD_KINDS: ReadonlySet<SlotKind> = new Set([
  "long",
  "quality_threshold",
  "quality_interval",
]);

/** How many quality (interval/threshold) sessions a phase wants. */
export function qualityCountForPhase(phase: Phase, isDeload: boolean): number {
  if (isDeload) return phase === "base" ? 0 : 1;
  switch (phase) {
    case "base":
      return 1;
    case "build":
      return 2;
    case "peak":
      return 2;
    case "taper":
      return 1;
    case "maintenance":
      return 1;
  }
}

/** The ordered list of quality kinds for a phase (threshold-leaning early). */
function qualityKinds(phase: Phase, count: number): SlotKind[] {
  const order: SlotKind[] =
    phase === "base"
      ? ["quality_threshold", "quality_interval"]
      : phase === "build"
        ? ["quality_threshold", "quality_interval"]
        : phase === "peak"
          ? ["quality_interval", "quality_threshold"]
          : ["quality_threshold", "quality_interval"];
  return order.slice(0, count);
}

export interface ScheduleRequest {
  phase: Phase;
  isDeload: boolean;
  availableDays: Weekday[];
  longDay: Weekday;
  strengthSessions: number;
  ruckSessions: number;
}

function dayIndex(d: Weekday): number {
  return WEEK_ORDER.indexOf(d);
}

function isAdjacent(a: Weekday, b: Weekday): boolean {
  return Math.abs(dayIndex(a) - dayIndex(b)) === 1;
}

/**
 * Produce the week's slots. Total sessions never exceeds the number of available
 * days; overflow is shed in priority order (easy → strength → ruck → quality).
 */
export function scheduleWeek(req: ScheduleRequest): SessionSlot[] {
  const days = [...req.availableDays].sort((a, b) => dayIndex(a) - dayIndex(b));
  if (days.length === 0) return [];

  const longDay = days.includes(req.longDay) ? req.longDay : days[days.length - 1]!;
  const assignment = new Map<Weekday, SlotKind>();
  assignment.set(longDay, "long");

  const free = (): Weekday[] => days.filter((d) => !assignment.has(d));

  // --- Place quality sessions, maximally spaced, never adjacent to a hard day.
  let quality = qualityKinds(req.phase, qualityCountForPhase(req.phase, req.isDeload));
  for (const q of quality) {
    const candidate = pickSpacedDay(free(), assignment);
    if (candidate) assignment.set(candidate, q);
  }

  // --- Place strength: prefer a free day that is NOT immediately before a hard
  //     day (so it doesn't compromise the next quality/long session).
  for (let i = 0; i < req.strengthSessions; i++) {
    const candidate = pickStrengthDay(free(), assignment);
    if (candidate) assignment.set(candidate, "strength");
  }

  // --- Place ruck on any remaining free day (treated as moderate aerobic load).
  for (let i = 0; i < req.ruckSessions; i++) {
    const candidate = free()[0];
    if (candidate) assignment.set(candidate, "ruck");
  }

  // --- Remaining available days become easy runs.
  for (const d of free()) assignment.set(d, "easy");

  return days.map((weekday) => ({ weekday, kind: assignment.get(weekday)! }));
}

/** Pick the free day that is furthest from all already-assigned hard days. */
function pickSpacedDay(
  freeDays: Weekday[],
  assignment: Map<Weekday, SlotKind>,
): Weekday | undefined {
  const hardDays = [...assignment.entries()]
    .filter(([, k]) => HARD_KINDS.has(k))
    .map(([d]) => d);

  // Eligible = not adjacent to any existing hard day.
  const eligible = freeDays.filter((d) => !hardDays.some((h) => isAdjacent(d, h)));
  const pool = eligible.length > 0 ? eligible : freeDays;
  if (pool.length === 0) return undefined;

  // Choose the day maximising the minimum distance to any hard day.
  let best: Weekday | undefined;
  let bestScore = -1;
  for (const d of pool) {
    const minDist =
      hardDays.length === 0
        ? 99
        : Math.min(...hardDays.map((h) => Math.abs(dayIndex(d) - dayIndex(h))));
    if (minDist > bestScore) {
      bestScore = minDist;
      best = d;
    }
  }
  return best;
}

/** Strength prefers a free day whose *next* day is not a hard session. */
function pickStrengthDay(
  freeDays: Weekday[],
  assignment: Map<Weekday, SlotKind>,
): Weekday | undefined {
  const okDays = freeDays.filter((d) => {
    const next = WEEK_ORDER[dayIndex(d) + 1];
    if (!next) return true;
    const nextKind = assignment.get(next);
    return !nextKind || !HARD_KINDS.has(nextKind);
  });
  const pool = okDays.length > 0 ? okDays : freeDays;
  return pool[0];
}
