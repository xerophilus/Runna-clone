import { describe, it, expect } from "vitest";
import { generatePlan, type GeneratePlanInput } from "../../core/engine/generatePlan";
import { DEFAULT_CONFIG } from "../../core/engine/config";
import {
  adjustmentToProposalArgs,
  parseLocally,
  propose,
  reflowFromIndex,
  inferHybrid,
} from "../adaptationLogic";
import { dropPreStartSessions } from "../planUtils";
import type { Goal, Plan } from "../../core/types/domain";

const goal: Goal = {
  id: "goal-1",
  type: "race",
  detail: { distance: 21097 },
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
    startDate: "2026-06-08", // a Monday
    config: DEFAULT_CONFIG,
    hybrid: { includeStrength: true, strengthPerWeek: 2, includeRuck: false, ruckPerWeek: 0 },
  };
}

function context() {
  const { planId: _p, startDate: _s, ...ctx } = input();
  return ctx;
}

describe("reflowFromIndex", () => {
  const plan = generatePlan(input());

  it("reflows from the current week when it is untouched", () => {
    // Monday of week 1, nothing logged yet
    expect(reflowFromIndex(plan, "2026-06-15")).toBe(1);
  });

  it("reflows from next week once the current week has elapsed days", () => {
    // Wednesday of week 1 — Mon/Tue are behind us
    expect(reflowFromIndex(plan, "2026-06-17")).toBe(2);
  });

  it("reflows from next week once a session in the current week is logged", () => {
    const logged: Plan = {
      ...plan,
      weeks: plan.weeks.map((w) =>
        w.week_index === 1
          ? {
              ...w,
              sessions: w.sessions.map((s, i) =>
                i === 0 ? { ...s, status: "completed" as const } : s,
              ),
            }
          : w,
      ),
    };
    expect(reflowFromIndex(logged, "2026-06-15")).toBe(2);
  });

  it("never exceeds the last week", () => {
    expect(reflowFromIndex(plan, "2099-01-01")).toBe(plan.weeks.length - 1);
  });
});

describe("propose", () => {
  const plan = generatePlan(input());

  it("produces a consented proposal for a fatigue back-off", () => {
    const p = propose(plan, context(), "manual_fatigue", { volumeScale: 0.85 }, "metric", "2026-06-15");
    expect(p.result.plan.version).toBe(plan.version + 1);
    expect(p.result.diff.requires_consent).toBe(true);
    expect(p.summary).toContain("beat up");
    expect(p.summary).toContain("goal date is unchanged");
  });

  it("keeps elapsed weeks identical", () => {
    const p = propose(plan, context(), "manual_fatigue", { volumeScale: 0.85 }, "metric", "2026-06-17");
    expect(p.result.plan.weeks[0]).toEqual(plan.weeks[0]);
    expect(p.result.plan.weeks[1]).toEqual(plan.weeks[1]);
  });

  it("can shift the long-run day from a user request", () => {
    const p = propose(plan, context(), "user_request", {}, "metric", "2026-06-15", {
      longDay: "sat",
    });
    const futureWeek = p.result.plan.weeks[4]!;
    const long = futureWeek.sessions.find(
      (s) => s.prescription.type === "run" && s.prescription.intent === "long",
    );
    expect(long).toBeDefined();
    // 2026-06-08 start; Saturday = index 5 of the week
    const day = new Date(`${long!.scheduled_date}T00:00:00Z`).getUTCDay();
    expect(day).toBe(6); // Saturday
  });
});

describe("parseLocally", () => {
  it("matches a long-run shift with a day", () => {
    expect(parseLocally("move my long run to Saturday")).toEqual({
      adjustment: "shift_long_run",
      to_day: "sat",
    });
  });

  it("matches fatigue language to a volume reduction", () => {
    expect(parseLocally("I'm feeling beat up, dial it back")).toEqual({
      adjustment: "reduce_volume",
      magnitude: "moderate",
    });
  });

  it("clarifies rather than guesses on ambiguity", () => {
    const out = parseLocally("what about thursdays?");
    expect(out.adjustment).toBe("clarify");
  });
});

describe("adjustmentToProposalArgs", () => {
  it("maps reduce_volume to a volume scale", () => {
    const args = adjustmentToProposalArgs({ adjustment: "reduce_volume", magnitude: "moderate" });
    expect("adjustments" in args && args.adjustments.volumeScale).toBeLessThan(1);
  });

  it("passes clarify through", () => {
    expect(adjustmentToProposalArgs({ adjustment: "clarify", question: "Which day?" })).toEqual({
      clarify: "Which day?",
    });
  });
});

describe("inferHybrid", () => {
  it("recovers the hybrid scope from a generated plan", () => {
    const plan = generatePlan(input());
    const hybrid = inferHybrid(plan);
    expect(hybrid.includeStrength).toBe(true);
    expect(hybrid.strengthPerWeek).toBeGreaterThanOrEqual(1);
    expect(hybrid.includeRuck).toBe(false);
  });
});

describe("dropPreStartSessions", () => {
  it("removes week-0 sessions before today (mid-week plan creation)", () => {
    const plan = generatePlan({ ...input(), startDate: "2026-06-10" }); // a Wednesday
    const trimmed = dropPreStartSessions(plan, "2026-06-10");
    expect(trimmed.weeks[0]!.sessions.every((s) => s.scheduled_date >= "2026-06-10")).toBe(true);
    // later weeks untouched
    expect(trimmed.weeks[1]).toEqual(plan.weeks[1]);
  });

  it("is a no-op when the plan starts today", () => {
    const plan = generatePlan({ ...input(), startDate: "2026-06-08" });
    expect(dropPreStartSessions(plan, "2026-06-08")).toEqual(plan);
  });
});
