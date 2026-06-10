/**
 * VDOT and pace derivation (spec §4 "Fitness model", §5.2 step 4).
 *
 * A single internal fitness number (VDOT) drives every run pace. We use the
 * Daniels–Gilbert model:
 *
 *   VO2(v)      = -4.60 + 0.182258·v + 0.000104·v²   (v in m/min)
 *   %VO2max(t)  = 0.8 + 0.1894393·e^(-0.012778·t)
 *                     + 0.2989558·e^(-0.1932605·t)    (t in minutes)
 *   VDOT        = VO2(v_race) / %VO2max(t_race)
 *
 * Paces for each training zone are derived by taking a target %VO2max anchor,
 * computing the required VO2, inverting VO2(v) for velocity, and converting to
 * sec/km. Ranges (not single points) come from the low/high anchors in config.
 *
 * The paces this produces are intentionally on the conservative side; the spec
 * wants cold-start estimates to be cautious and recalibrated after ~2 weeks of
 * logged data (§10 "VDOT cold-start").
 */

import type { EngineConfig } from "./config.js";

const A = 0.000104;
const B = 0.182258;
const C = -4.6;

/** VO2 cost (ml/kg/min) of running at velocity `v` (m/min). */
export function vo2FromVelocity(v: number): number {
  return C + B * v + A * v * v;
}

/** Invert VO2(v) to get the velocity (m/min) that costs `vo2`. */
export function velocityFromVo2(vo2: number): number {
  // A·v² + B·v + (C - vo2) = 0  → positive root
  const disc = B * B - 4 * A * (C - vo2);
  if (disc <= 0) return 0;
  return (-B + Math.sqrt(disc)) / (2 * A);
}

/** Fraction of VO2max sustainable for a race lasting `tMin` minutes. */
export function percentVo2maxForDuration(tMin: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMin) +
    0.2989558 * Math.exp(-0.1932605 * tMin)
  );
}

/**
 * Compute VDOT from a race/time-trial performance.
 * @param distanceM race distance in meters
 * @param timeS finish time in seconds
 */
export function vdotFromRace(distanceM: number, timeS: number): number {
  if (distanceM <= 0 || timeS <= 0) {
    throw new Error("vdotFromRace requires positive distance and time");
  }
  const tMin = timeS / 60;
  const v = distanceM / tMin; // m/min
  const vo2 = vo2FromVelocity(v);
  const pct = percentVo2maxForDuration(tMin);
  return vo2 / pct;
}

/**
 * Estimate VDOT from a self-reported easy pace when no race data exists.
 * Easy running sits at the low end of the easy anchor; we invert that
 * relationship to recover an approximate VDOT, then keep it conservative.
 *
 * @param easyPaceSecPerKm self-reported comfortable easy pace
 */
export function vdotFromEasyPace(
  easyPaceSecPerKm: number,
  config: EngineConfig,
): number {
  const v = 60000 / easyPaceSecPerKm; // m/min
  const vo2AtEasy = vo2FromVelocity(v);
  // Easy pace ≈ midpoint of the easy %VO2max anchor.
  const [lo, hi] = config.intensityAnchors.easy;
  const midPct = (lo + hi) / 2;
  return vo2AtEasy / midPct;
}

export interface PaceRange {
  /** faster end, sec/km */
  low: number;
  /** slower end, sec/km */
  high: number;
  unit: "sec_per_km";
}

function paceRangeForAnchor(
  vdot: number,
  anchor: [number, number],
): PaceRange {
  const [pctLo, pctHi] = anchor;
  // higher %VO2max → faster velocity → lower sec/km
  const vSlow = velocityFromVo2(pctLo * vdot);
  const vFast = velocityFromVo2(pctHi * vdot);
  return {
    low: Math.round(60000 / vFast),
    high: Math.round(60000 / vSlow),
    unit: "sec_per_km",
  };
}

export interface TrainingPaces {
  easy: PaceRange;
  marathon: PaceRange;
  threshold: PaceRange;
  interval: PaceRange;
  repetition: PaceRange;
}

/** Derive the full set of training paces from a VDOT. */
export function pacesFromVdot(
  vdot: number,
  config: EngineConfig,
): TrainingPaces {
  const a = config.intensityAnchors;
  return {
    easy: paceRangeForAnchor(vdot, a.easy),
    marathon: paceRangeForAnchor(vdot, a.marathon),
    threshold: paceRangeForAnchor(vdot, a.threshold),
    interval: paceRangeForAnchor(vdot, a.interval),
    repetition: paceRangeForAnchor(vdot, a.repetition),
  };
}

/** Convenience: midpoint pace of a range (sec/km). */
export function midPace(range: PaceRange): number {
  return Math.round((range.low + range.high) / 2);
}
