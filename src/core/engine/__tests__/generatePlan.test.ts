import { describe, it, expect } from "vitest";
import { generatePlan, type GeneratePlanInput } from "../generatePlan.js";
import { DEFAULT_CONFIG } from "../config.js";
import type { Goal } from "../../types/domain.js";

const raceGoal: Goal = {
  id: "goal-1",
  type: "race",
  detail: { distance: 42195, target_time: 3 * 3600 + 30 * 60 },
  goal_date: "2026-09-28", // a Monday ~16 weeks out from start
  status: "active",
};

function baseInput(overrides: Partial<GeneratePlanInput> = {}): GeneratePlanInput {
  return {
    planId: "plan-1",
    userId: "user-1",
    goal: raceGoal,
    baseline: { vdot: 50, current_weekly_run_m: 40_000 },
    availability: {
      days_per_week: 6,
      day_prefs: ["mon", "tue", "wed", "thu", "fri", "sun"],
      long_day: "sun",
      minutes_per_session: 75,
      equipment: ["full_gym"],
    },
    startDate: "2026-06-08", // a Monday
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

describe("generatePlan — race", () => {
  const plan = generatePlan(baseInput());

  it("produces a periodized plan spanning to the goal", () => {
    expect(plan.weeks.length).toBeGreaterThan(10);
    expect(plan.phase_structure.map((p) => p.phase)).toEqual([
      "base",
      "build",
      "peak",
      "taper",
    ]);
  });

  it("ends with a taper week", () => {
    expect(plan.weeks[plan.weeks.length - 1]!.phase).toBe("taper");
  });

  it("schedules the long run on the user's long day each week", () => {
    for (const week of plan.weeks) {
      const long = week.sessions.find(
        (s) => s.prescription.type === "run" && s.prescription.intent === "long",
      );
      // Some deload/taper weeks may still carry a long run; when present it must be Sunday.
      if (long) {
        const day = new Date(long.scheduled_date).getUTCDay(); // 0 = Sun
        expect(day).toBe(0);
      }
    }
  });

  it("gives every non-rest session a structured prescription with targets", () => {
    for (const week of plan.weeks) {
      for (const s of week.sessions) {
        expect(s.prescription).toBeTruthy();
        expect(s.prescription.est_duration_s).toBeGreaterThanOrEqual(0);
        if (s.prescription.type === "run") {
          for (const block of s.prescription.blocks) {
            for (const seg of block.segments) {
              expect(seg.work.target.high).toBeGreaterThanOrEqual(seg.work.target.low);
            }
          }
        }
      }
    }
  });

  it("derives a sensible weekly target volume", () => {
    expect(plan.weeks[0]!.target_volume.run_distance).toBeGreaterThan(0);
    expect(plan.weeks[0]!.target_volume.run_time).toBeGreaterThan(0);
  });

  it("is fully deterministic for identical inputs", () => {
    const a = generatePlan(baseInput());
    const b = generatePlan(baseInput());
    expect(a).toEqual(b);
  });

  it("snaps the start date to a Monday", () => {
    const plan = generatePlan(baseInput({ startDate: "2026-06-10" })); // a Wednesday
    expect(new Date(plan.start_date).getUTCDay()).toBe(1); // Monday
  });

  it("leaves session.display null for the LLM layer to fill", () => {
    expect(plan.weeks[0]!.sessions[0]!.display).toBeNull();
  });
});

describe("generatePlan — hybrid", () => {
  it("adds strength sessions when hybrid scope is enabled", () => {
    const plan = generatePlan(
      baseInput({
        hybrid: { includeStrength: true, strengthPerWeek: 2, includeRuck: true, ruckPerWeek: 1 },
      }),
    );
    const week = plan.weeks.find((w) => !w.is_deload && w.phase === "build")!;
    const strength = week.sessions.filter((s) => s.prescription.type === "strength");
    const ruck = week.sessions.filter((s) => s.prescription.type === "ruck");
    expect(strength.length).toBeGreaterThanOrEqual(1);
    expect(ruck.length).toBe(1);
  });
});

describe("generatePlan — maintenance", () => {
  it("builds a fixed-horizon maintenance plan with no goal date", () => {
    const goal: Goal = {
      id: "goal-m",
      type: "maintenance",
      detail: { emphasis: "balanced" },
      goal_date: null,
      status: "active",
    };
    const plan = generatePlan(baseInput({ goal, maintenanceWeeks: 8 }));
    expect(plan.weeks).toHaveLength(8);
    expect(plan.phase_structure).toEqual([{ phase: "maintenance", week_count: 8 }]);
  });
});

describe("generatePlan — cold start", () => {
  it("generates a conservative plan with no fitness data", () => {
    const plan = generatePlan(baseInput({ baseline: {} }));
    expect(plan.weeks.length).toBeGreaterThan(0);
    expect(plan.weeks[0]!.target_volume.run_distance).toBeGreaterThan(0);
  });
});
