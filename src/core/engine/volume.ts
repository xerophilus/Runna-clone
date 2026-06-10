/**
 * Weekly volume progression (spec §5.2 step 2).
 *
 * Produces a per-week target run volume (meters) across the whole plan:
 *   - starts from the user's current weekly run volume,
 *   - ramps by no more than `maxWeeklyRampPct` per loading week,
 *   - inserts a deload every `deloadEveryNWeeks` that drops to
 *     `deloadVolumeFactor` of the prior loading week,
 *   - holds/declines through taper.
 *
 * The "10% / deload-every-4th" heuristic lives entirely in config; this module
 * just applies whatever it's given, which keeps it testable and tunable.
 */

import type { EngineConfig } from "./config.js";
import type { Phase, PhaseSpan } from "../types/domain.js";

export interface WeekVolumePlan {
  week_index: number;
  phase: Phase;
  /** target run volume for the week in meters */
  run_distance_m: number;
  is_deload: boolean;
}

/** Flatten the phase spans into a per-week phase label array. */
export function expandPhases(phaseStructure: PhaseSpan[]): Phase[] {
  const out: Phase[] = [];
  for (const span of phaseStructure) {
    for (let i = 0; i < span.week_count; i++) out.push(span.phase);
  }
  return out;
}

/** Taper multiplier: progressively shed volume across the taper weeks. */
function taperMultiplier(weekInTaper: number, taperLen: number): number {
  // First taper week ~75% of peak, last ~45%, linear between.
  if (taperLen <= 1) return 0.6;
  const t = weekInTaper / (taperLen - 1); // 0..1
  return 0.75 - 0.3 * t;
}

export function buildVolumeProgression(
  phaseStructure: PhaseSpan[],
  startWeeklyRunM: number,
  config: EngineConfig,
): WeekVolumePlan[] {
  const phases = expandPhases(phaseStructure);
  const totalWeeks = phases.length;
  if (totalWeeks === 0) return [];

  const taperLen =
    phaseStructure.find((p) => p.phase === "taper")?.week_count ?? 0;
  const firstTaperIndex = totalWeeks - taperLen;

  const out: WeekVolumePlan[] = [];
  // `lastLoad` tracks the most recent *loading* week's volume so deloads are
  // expressed relative to load, and the next load resumes from load (not deload).
  let lastLoad = Math.max(0, startWeeklyRunM);
  let peakLoad = lastLoad;
  let weeksSinceDeload = 0;

  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i]!;
    const inTaper = phase === "taper";

    if (inTaper) {
      const weekInTaper = i - firstTaperIndex;
      const mult = taperMultiplier(weekInTaper, taperLen);
      out.push({
        week_index: i,
        phase,
        run_distance_m: Math.round(peakLoad * mult),
        is_deload: false,
      });
      continue;
    }

    // Deload cadence applies within loading phases.
    const isDeload =
      i > 0 && weeksSinceDeload >= config.deloadEveryNWeeks - 1;

    if (i === 0) {
      // First week starts at the seeded volume.
      out.push({ week_index: i, phase, run_distance_m: Math.round(lastLoad), is_deload: false });
      weeksSinceDeload = 1;
      continue;
    }

    if (isDeload) {
      const deload = Math.round(lastLoad * config.deloadVolumeFactor);
      out.push({ week_index: i, phase, run_distance_m: deload, is_deload: true });
      weeksSinceDeload = 0;
      continue;
    }

    // Loading week: ramp up from the last loading week, capped.
    // Floor (not round) so the increase never exceeds the cap.
    const ramped = Math.floor(lastLoad * (1 + config.maxWeeklyRampPct));
    lastLoad = ramped;
    peakLoad = Math.max(peakLoad, ramped);
    out.push({ week_index: i, phase, run_distance_m: ramped, is_deload: false });
    weeksSinceDeload++;
  }

  return out;
}
