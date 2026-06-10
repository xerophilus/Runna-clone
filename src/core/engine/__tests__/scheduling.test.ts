import { describe, it, expect } from "vitest";
import { scheduleWeek, WEEK_ORDER, type SessionSlot } from "../scheduling.js";
import type { Weekday } from "../../types/domain.js";

const HARD = new Set(["long", "quality_threshold", "quality_interval"]);

function adjacentHardViolations(slots: SessionSlot[]): number {
  const idx = (d: Weekday) => WEEK_ORDER.indexOf(d);
  const ordered = [...slots].sort((a, b) => idx(a.weekday) - idx(b.weekday));
  let v = 0;
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1]!;
    const cur = ordered[i]!;
    if (idx(cur.weekday) - idx(prev.weekday) === 1 && HARD.has(cur.kind) && HARD.has(prev.kind)) {
      v++;
    }
  }
  return v;
}

describe("weekly scheduling", () => {
  it("places the long run on the designated long day", () => {
    const slots = scheduleWeek({
      phase: "build",
      isDeload: false,
      availableDays: ["mon", "tue", "wed", "thu", "sat", "sun"],
      longDay: "sat",
      strengthSessions: 0,
      ruckSessions: 0,
    });
    const long = slots.find((s) => s.kind === "long");
    expect(long?.weekday).toBe("sat");
  });

  it("never stacks two hard sessions back-to-back", () => {
    const slots = scheduleWeek({
      phase: "build",
      isDeload: false,
      availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      longDay: "sun",
      strengthSessions: 2,
      ruckSessions: 0,
    });
    expect(adjacentHardViolations(slots)).toBe(0);
  });

  it("includes the requested number of quality sessions in build phase", () => {
    const slots = scheduleWeek({
      phase: "build",
      isDeload: false,
      availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      longDay: "sun",
      strengthSessions: 0,
      ruckSessions: 0,
    });
    const quality = slots.filter(
      (s) => s.kind === "quality_threshold" || s.kind === "quality_interval",
    );
    expect(quality).toHaveLength(2);
  });

  it("never produces more slots than available days", () => {
    const slots = scheduleWeek({
      phase: "peak",
      isDeload: false,
      availableDays: ["mon", "wed", "fri", "sat"],
      longDay: "sat",
      strengthSessions: 2,
      ruckSessions: 1,
    });
    expect(slots.length).toBeLessThanOrEqual(4);
  });

  it("fills leftover days with easy runs", () => {
    const slots = scheduleWeek({
      phase: "base",
      isDeload: false,
      availableDays: ["mon", "tue", "thu", "sat"],
      longDay: "sat",
      strengthSessions: 0,
      ruckSessions: 0,
    });
    expect(slots.some((s) => s.kind === "easy")).toBe(true);
  });

  it("is deterministic for the same request", () => {
    const req = {
      phase: "build" as const,
      isDeload: false,
      availableDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as Weekday[],
      longDay: "sun" as Weekday,
      strengthSessions: 1,
      ruckSessions: 0,
    };
    expect(scheduleWeek(req)).toEqual(scheduleWeek(req));
  });
});
