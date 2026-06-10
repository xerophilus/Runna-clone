/**
 * Phase allocation (spec §5.2 step 1).
 *
 * Given the number of weeks until the goal, lay out the periodized phases:
 *   - race goals:  base → build → peak → taper
 *   - maintenance: a single repeating maintenance phase (deloads handled by the
 *     volume layer, not phase boundaries)
 *
 * Allocation respects per-phase minimums and a mandatory taper scaled to race
 * distance. The result always sums to exactly `weeks`.
 */

import type { EngineConfig } from "./config.js";
import type { PhaseSpan } from "../types/domain.js";

/** Taper length scales with race distance: longer races taper longer. */
export function taperWeeksForDistance(
  distanceM: number,
  config: EngineConfig,
): number {
  const { taperWeeksMin, taperWeeksMax } = config;
  if (distanceM >= 42195) return taperWeeksMax; // marathon+
  if (distanceM >= 21097) return Math.min(taperWeeksMax, 2); // half
  if (distanceM >= 10000) return Math.max(taperWeeksMin, 1); // 10k
  return taperWeeksMin; // 5k and shorter
}

export function allocateMaintenancePhases(weeks: number): PhaseSpan[] {
  if (weeks <= 0) return [];
  return [{ phase: "maintenance", week_count: weeks }];
}

/**
 * Allocate base/build/peak/taper across `weeks`.
 *
 * Strategy:
 *  1. Reserve the distance-scaled taper (clamped so it never exceeds the runway
 *     minus room for at least the other phase minimums).
 *  2. Split the remainder by the configured ratios.
 *  3. Enforce per-phase minimums, then reconcile rounding so the total is exact.
 */
export function allocateRacePhases(
  weeks: number,
  distanceM: number,
  config: EngineConfig,
): PhaseSpan[] {
  if (weeks <= 0) return [];

  const min = config.phaseMinWeeks;

  // Very short runway: degrade gracefully rather than emit impossible plans.
  // Below the sum of minimums, hand everything to base then taper.
  const minSum = min.base + min.build + min.peak + min.taper;
  if (weeks <= minSum) {
    return degradeShortRunway(weeks, min.taper);
  }

  let taper = taperWeeksForDistance(distanceM, config);
  // Never let taper crowd out the other minimums.
  const maxTaper = weeks - (min.base + min.build + min.peak);
  taper = Math.max(config.taperWeeksMin, Math.min(taper, maxTaper));

  const remaining = weeks - taper;
  const split = config.racePhaseSplit;
  // Re-normalise base/build/peak ratios (excluding taper) across `remaining`.
  const denom = split.base + split.build + split.peak;
  let base = Math.round((remaining * split.base) / denom);
  let build = Math.round((remaining * split.build) / denom);
  let peak = remaining - base - build; // peak absorbs rounding first

  // Enforce minimums.
  base = Math.max(base, min.base);
  build = Math.max(build, min.build);
  peak = Math.max(peak, min.peak);

  // Reconcile: if minimum enforcement overshot, trim from the largest phase.
  let total = base + build + peak + taper;
  while (total > weeks) {
    const largest = pickLargestTrimmable({ base, build, peak }, min);
    if (largest === null) break;
    if (largest === "base") base--;
    else if (largest === "build") build--;
    else peak--;
    total = base + build + peak + taper;
  }
  // If we still have slack (undershoot), give it to base (most aerobic value).
  while (total < weeks) {
    base++;
    total = base + build + peak + taper;
  }

  return [
    { phase: "base", week_count: base },
    { phase: "build", week_count: build },
    { phase: "peak", week_count: peak },
    { phase: "taper", week_count: taper },
  ].filter((p) => p.week_count > 0) as PhaseSpan[];
}

function degradeShortRunway(weeks: number, taperMin: number): PhaseSpan[] {
  if (weeks === 1) return [{ phase: "taper", week_count: 1 }];
  const taper = Math.min(taperMin, 1);
  const base = weeks - taper;
  return [
    { phase: "base", week_count: base },
    { phase: "taper", week_count: taper },
  ].filter((p) => p.week_count > 0) as PhaseSpan[];
}

function pickLargestTrimmable(
  cur: { base: number; build: number; peak: number },
  min: { base: number; build: number; peak: number },
): "base" | "build" | "peak" | null {
  const candidates: Array<["base" | "build" | "peak", number]> = [];
  if (cur.base > min.base) candidates.push(["base", cur.base]);
  if (cur.build > min.build) candidates.push(["build", cur.build]);
  if (cur.peak > min.peak) candidates.push(["peak", cur.peak]);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0]![0];
}
