import { describe, it, expect } from "vitest";
import { generatePlan, type GeneratePlanInput } from "../generatePlan.js";
import { DEFAULT_CONFIG } from "../config.js";
import {
  countMisses,
  detectTrigger,
  reflowPlan,
  isKeySession,
} from "../adaptation.js";
import type { Goal, Plan } from "../../types/domain.js";

const goal: Goal = {
  id: "goal-1",
  type: "race",
  detail: { distance: 21097, target_time: 95 * 60 },
  goal_date: "2026-09-28",
  status: "active",
};

function input(): GeneratePlanInput {
  return {
    planId: "plan-1",
    userId: "user-1",
    goal,
    baseline: { vdot: 48, current_weekly_run_m: 35_000 },
    availability: {
      days_per_week: 5,
      day_prefs: ["mon", "tue", "thu", "fri", "sun"],
      long_day: "sun",
      minutes_per_session: 60,
      equipment: ["dumbbells"],
    },
    startDate: "2026-06-08",
    config: DEFAULT_CONFIG,
  };
}

/** Mark the first N key sessions in a given week as skipped. */
function skipKeySessions(plan: Plan, weekIndex: number, n: number): Plan {
  const weeks = plan.weeks.map((w) => {
    if (w.week_index !== weekIndex) return w;
    let remaining = n;
    return {
      ...w,
      sessions: w.sessions.map((s) => {
        if (remaining > 0 && isKeySession(s)) {
          remaining--;
          return { ...s, status: "skipped" as const };
        }
        return s;
      }),
    };
  });
  return { ...plan, weeks };
}

describe("miss detection", () => {
  it("counts skipped key sessions within the window", () => {
    const plan = skipKeySessions(generatePlan(input()), 0, 2);
    const w0 = plan.weeks[0]!;
    const end = w0.sessions[w0.sessions.length - 1]!.scheduled_date;
    const counts = countMisses(plan, plan.start_date, end);
    expect(counts.key).toBe(2);
  });

  it("fires the missed_sessions trigger past threshold", () => {
    const plan = skipKeySessions(generatePlan(input()), 0, 2);
    const w0 = plan.weeks[0]!;
    const asOf = w0.sessions[w0.sessions.length - 1]!.scheduled_date;
    expect(detectTrigger(plan, asOf, DEFAULT_CONFIG)).toBe("missed_sessions");
  });

  it("does not fire when adherence is fine", () => {
    const plan = generatePlan(input());
    const asOf = plan.weeks[0]!.sessions[0]!.scheduled_date;
    expect(detectTrigger(plan, asOf, DEFAULT_CONFIG)).toBeNull();
  });
});

describe("reflow", () => {
  const original = generatePlan(input());

  it("keeps completed weeks immutable", () => {
    const { plan: reflowed } = reflowPlan(
      original,
      input(),
      4,
      "missed_sessions",
      { volumeScale: 0.85 },
    );
    for (let i = 0; i < 4; i++) {
      expect(reflowed.weeks[i]).toEqual(original.weeks[i]);
    }
  });

  it("bumps the plan version", () => {
    const { plan: reflowed } = reflowPlan(original, input(), 4, "manual_fatigue", {
      volumeScale: 0.8,
    });
    expect(reflowed.version).toBe(original.version + 1);
  });

  it("protects the goal date by default", () => {
    const { plan: reflowed, diff } = reflowPlan(original, input(), 4, "missed_sessions", {
      volumeScale: 0.85,
    });
    expect(diff.goal_date_changed).toBe(false);
    // weeks count to the goal is unchanged
    expect(reflowed.weeks.length).toBe(original.weeks.length);
  });

  it("flags consent when volume shifts beyond the threshold", () => {
    const { diff } = reflowPlan(original, input(), 4, "manual_fatigue", {
      volumeScale: 0.7, // 30% cut — well past the 10% consent threshold
    });
    expect(diff.requires_consent).toBe(true);
    expect(diff.weeks_changed.length).toBeGreaterThan(0);
  });

  it("requires consent when the goal date moves", () => {
    const { diff } = reflowPlan(original, input(), 4, "user_request", {
      pushGoalDays: 14,
    });
    expect(diff.goal_date_changed).toBe(true);
    expect(diff.requires_consent).toBe(true);
    expect(diff.goal_date_after).not.toBe(diff.goal_date_before);
  });

  it("produces continuous week indices after splicing", () => {
    const { plan: reflowed } = reflowPlan(original, input(), 4, "missed_sessions", {
      volumeScale: 0.9,
    });
    reflowed.weeks.forEach((w, i) => expect(w.week_index).toBe(i));
  });
});
