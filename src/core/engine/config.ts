/**
 * Engine configuration (spec §3, §5.2, §10).
 *
 * Everything load-bearing about periodization is a tunable parameter here, not
 * a magic number scattered through the code. The spec is explicit: the "~10%
 * per week, deload every 4th week" heuristics must be config, and adaptation
 * thresholds should ship as server-side config so they can be tuned against
 * real usage without a release.
 *
 * `ENGINE_VERSION` is bumped whenever the deterministic output for the same
 * inputs would change, so plans can be diffed across versions during adaptation
 * (idempotency requirement, spec §5.2).
 */

export const ENGINE_VERSION = 1;

/** Velocity-zone anchors as a fraction of VO2max, used to derive run paces. */
export interface IntensityAnchors {
  /** [low %VO2max, high %VO2max] — low fraction = slower = the slow end of the range */
  easy: [number, number];
  marathon: [number, number];
  threshold: [number, number];
  interval: [number, number];
  repetition: [number, number];
}

export interface PhaseSplit {
  base: number;
  build: number;
  peak: number;
  taper: number;
}

export interface EngineConfig {
  /** Maximum week-over-week increase in run volume (e.g. 0.10 = 10%). */
  maxWeeklyRampPct: number;
  /** Insert a deload every Nth week within a progression block. */
  deloadEveryNWeeks: number;
  /** Deload weeks drop volume to this fraction of the prior loading week. */
  deloadVolumeFactor: number;
  /** Phase allocation for race goals (fractions of available weeks; must sum to 1). */
  racePhaseSplit: PhaseSplit;
  /** Minimum weeks each phase gets when runway is short. */
  phaseMinWeeks: PhaseSplit;
  /** Taper length bounds in weeks, scaled by race distance. */
  taperWeeksMin: number;
  taperWeeksMax: number;
  /** %VO2max anchors used to derive paces from VDOT. */
  intensityAnchors: IntensityAnchors;
  /** Fraction of weekly run volume allocated to the long run. */
  longRunFraction: number;
  /** Hard caps so a single long run never dominates the week unrealistically. */
  longRunMaxFraction: number;

  // --- Adaptation thresholds (spec §5.5, §10) ---
  adaptation: {
    /** Trigger after this many missed *key* sessions in the rolling window. */
    missedKeyThreshold: number;
    /** Trigger after this many missed sessions total in the rolling window. */
    missedTotalThreshold: number;
    /** Rolling window in days for counting misses. */
    missWindowDays: number;
    /** Consecutive below-prescription efforts before underperformance fires. */
    underperformanceStreak: number;
    /**
     * Volume change (fraction) above which a reflow needs explicit user
     * consent rather than applying silently.
     */
    consentVolumeThreshold: number;
  };
}

/**
 * Conservative defaults. The spec calls for a conservative starting posture
 * with a user-facing sensitivity setting layered on later (§10 decision 3).
 */
export const DEFAULT_CONFIG: EngineConfig = {
  maxWeeklyRampPct: 0.1,
  deloadEveryNWeeks: 4,
  deloadVolumeFactor: 0.7,
  racePhaseSplit: { base: 0.4, build: 0.35, peak: 0.15, taper: 0.1 },
  phaseMinWeeks: { base: 2, build: 1, peak: 1, taper: 1 },
  taperWeeksMin: 1,
  taperWeeksMax: 3,
  intensityAnchors: {
    easy: [0.62, 0.7],
    marathon: [0.78, 0.83],
    threshold: [0.83, 0.88],
    interval: [0.95, 1.0],
    repetition: [1.02, 1.08],
  },
  longRunFraction: 0.3,
  longRunMaxFraction: 0.35,
  adaptation: {
    missedKeyThreshold: 2,
    missedTotalThreshold: 3,
    missWindowDays: 7,
    underperformanceStreak: 3,
    consentVolumeThreshold: 0.1,
  },
};
