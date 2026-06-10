import { describe, it, expect } from "vitest";
import { matchActivity } from "./matchActivity.js";
import type { Activity, Session } from "../types/domain.js";

function runSession(id: string, date: string, distanceM: number): Session {
  return {
    id,
    week_id: "w",
    plan_id: "p",
    type: "run",
    scheduled_date: date,
    prescription: {
      type: "run",
      intent: "easy",
      blocks: [
        { label: "Run", segments: [{ work: { measure: "distance", value: distanceM, target: { kind: "pace", low: 300, high: 330, unit: "sec_per_km" } } }] },
      ],
      est_duration_s: 1800,
    },
    display: null,
    status: "scheduled",
    effort_flag: null,
  };
}

function activity(date: string, distanceM: number, type: Activity["type"] = "run"): Activity {
  return {
    id: "a",
    user_id: "u",
    session_id: null,
    source: "healthkit",
    type,
    started_at: `${date}T07:30:00Z`,
    duration_s: 1800,
    metrics: { distance: distanceM },
    rpe: null,
  };
}

describe("activity matching", () => {
  it("confidently matches a lone same-day run", () => {
    const sessions = [runSession("s1", "2026-06-10", 8000)];
    const res = matchActivity(activity("2026-06-10", 8100), sessions);
    expect(res.confidence).toBe("confident");
    expect(res.session?.id).toBe("s1");
  });

  it("returns none when there's no scheduled session that day", () => {
    const sessions = [runSession("s1", "2026-06-11", 8000)];
    const res = matchActivity(activity("2026-06-10", 8100), sessions);
    expect(res.confidence).toBe("none");
    expect(res.session).toBeNull();
  });

  it("stays ambiguous with two runs on the same day", () => {
    const sessions = [runSession("s1", "2026-06-10", 8000), runSession("s2", "2026-06-10", 16000)];
    const res = matchActivity(activity("2026-06-10", 15500), sessions);
    expect(res.confidence).toBe("ambiguous");
    // closest by distance should rank first
    expect(res.session?.id).toBe("s2");
    expect(res.alternatives.map((s) => s.id)).toContain("s1");
  });

  it("does not match an already-completed session", () => {
    const s = runSession("s1", "2026-06-10", 8000);
    s.status = "completed";
    const res = matchActivity(activity("2026-06-10", 8100), [s]);
    expect(res.confidence).toBe("none");
  });

  it("treats a ruck logged against a scheduled run as ambiguous, not silent", () => {
    const sessions = [runSession("s1", "2026-06-10", 8000)];
    const res = matchActivity(activity("2026-06-10", 8000, "ruck"), sessions);
    expect(res.confidence).toBe("ambiguous");
  });
});
