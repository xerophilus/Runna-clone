/**
 * HealthKit activity → session matching (spec §5.4).
 *
 * "Never silently mis-match." We auto-match by date + type proximity and return
 * a confidence band. The app uses this to decide whether to mark a session
 * complete automatically (confident) or prompt the user to confirm (ambiguous).
 */

import type { Activity, Session } from "../types/domain.js";
import type { SessionType } from "../types/prescription.js";

export type MatchConfidence = "confident" | "ambiguous" | "none";

export interface MatchResult {
  session: Session | null;
  confidence: MatchConfidence;
  /** other plausible sessions when the match is ambiguous */
  alternatives: Session[];
}

/** Run and ruck both register as foot-based GPS workouts; treat as compatible. */
function typesCompatible(a: SessionType, b: SessionType): boolean {
  if (a === b) return true;
  const footBased: SessionType[] = ["run", "ruck"];
  return footBased.includes(a) && footBased.includes(b);
}

function sameDay(isoDate: string, isoDateTime: string): boolean {
  return isoDate === isoDateTime.slice(0, 10);
}

/**
 * Match an imported activity against the plan's scheduled sessions.
 *
 *  - exactly one same-day, type-compatible, still-open session → confident
 *  - multiple candidates (e.g. two runs that day) → ambiguous, with alternatives
 *  - none → unmatched (left for the user to file)
 */
export function matchActivity(activity: Activity, sessions: Session[]): MatchResult {
  const candidates = sessions.filter(
    (s) =>
      s.status === "scheduled" &&
      s.prescription.type !== "rest" &&
      sameDay(s.scheduled_date, activity.started_at) &&
      typesCompatible(s.type, activity.type),
  );

  if (candidates.length === 0) {
    return { session: null, confidence: "none", alternatives: [] };
  }

  if (candidates.length === 1) {
    const only = candidates[0]!;
    // Exact type + same day is confident; a foot-based cross-type (run vs ruck)
    // is plausible but worth confirming.
    const confidence: MatchConfidence = only.type === activity.type ? "confident" : "ambiguous";
    return { session: only, confidence, alternatives: [] };
  }

  // Multiple candidates: prefer an exact type match, but stay ambiguous so the
  // user confirms rather than us guessing.
  const ranked = rankByCloseness(activity, candidates);
  return { session: ranked[0]!, confidence: "ambiguous", alternatives: ranked.slice(1) };
}

function rankByCloseness(activity: Activity, candidates: Session[]): Session[] {
  return [...candidates].sort((a, b) => score(activity, a) - score(activity, b));
}

/** Lower score = better match. */
function score(activity: Activity, session: Session): number {
  let s = 0;
  if (session.type !== activity.type) s += 100;
  const target = expectedDistance(session);
  if (target != null && activity.metrics.distance != null) {
    s += Math.abs(target - activity.metrics.distance) / 1000;
  }
  return s;
}

function expectedDistance(session: Session): number | null {
  const p = session.prescription;
  if (p.type === "ruck") return p.distance_m;
  if (p.type === "run") {
    let total = 0;
    for (const b of p.blocks)
      for (const seg of b.segments)
        if (seg.work.measure === "distance") total += (seg.repeat ?? 1) * seg.work.value;
    return total;
  }
  return null;
}

/**
 * Pre-fill metrics onto a matched session's would-be activity record. Returns a
 * shallow patch the caller applies; never mutates inputs.
 */
export function buildMatchPatch(
  activity: Activity,
  session: Session,
): { session_id: string; status: Session["status"] } {
  return { session_id: session.id, status: "completed" };
}
