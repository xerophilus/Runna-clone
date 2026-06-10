import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import {
  allocateRacePhases,
  allocateMaintenancePhases,
  taperWeeksForDistance,
} from "../phases";

const sum = (spans: { week_count: number }[]) =>
  spans.reduce((a, s) => a + s.week_count, 0);

describe("race phase allocation", () => {
  it("always sums to the available weeks", () => {
    for (let w = 4; w <= 24; w++) {
      const spans = allocateRacePhases(w, 42195, DEFAULT_CONFIG);
      expect(sum(spans)).toBe(w);
    }
  });

  it("produces base → build → peak → taper in order for a normal runway", () => {
    const spans = allocateRacePhases(16, 42195, DEFAULT_CONFIG);
    expect(spans.map((s) => s.phase)).toEqual(["base", "build", "peak", "taper"]);
  });

  it("always ends with a taper", () => {
    for (const w of [6, 8, 12, 16, 20]) {
      const spans = allocateRacePhases(w, 21097, DEFAULT_CONFIG);
      expect(spans[spans.length - 1]!.phase).toBe("taper");
    }
  });

  it("gives base the most weeks in a 16-week marathon block", () => {
    const spans = allocateRacePhases(16, 42195, DEFAULT_CONFIG);
    const base = spans.find((s) => s.phase === "base")!;
    for (const other of spans.filter((s) => s.phase !== "base")) {
      expect(base.week_count).toBeGreaterThanOrEqual(other.week_count);
    }
  });

  it("respects per-phase minimums", () => {
    const spans = allocateRacePhases(8, 42195, DEFAULT_CONFIG);
    const byPhase = Object.fromEntries(spans.map((s) => [s.phase, s.week_count]));
    expect(byPhase.base).toBeGreaterThanOrEqual(DEFAULT_CONFIG.phaseMinWeeks.base);
    expect(byPhase.taper ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("degrades gracefully on an impossibly short runway", () => {
    const spans = allocateRacePhases(2, 42195, DEFAULT_CONFIG);
    expect(sum(spans)).toBe(2);
    expect(spans[spans.length - 1]!.phase).toBe("taper");
  });
});

describe("taper scaling", () => {
  it("tapers longer for longer races", () => {
    const marathon = taperWeeksForDistance(42195, DEFAULT_CONFIG);
    const fiveK = taperWeeksForDistance(5000, DEFAULT_CONFIG);
    expect(marathon).toBeGreaterThan(fiveK);
  });
});

describe("maintenance allocation", () => {
  it("is a single maintenance span", () => {
    const spans = allocateMaintenancePhases(12);
    expect(spans).toEqual([{ phase: "maintenance", week_count: 12 }]);
  });
});
