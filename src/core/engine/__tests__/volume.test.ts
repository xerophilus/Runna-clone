import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import { allocateRacePhases } from "../phases";
import { buildVolumeProgression } from "../volume";

const config = DEFAULT_CONFIG;

describe("volume progression", () => {
  const phases = allocateRacePhases(16, 42195, config);
  const start = 30_000;
  const prog = buildVolumeProgression(phases, start, config);

  it("produces one entry per week", () => {
    expect(prog).toHaveLength(16);
  });

  it("starts at the seeded volume", () => {
    expect(prog[0]!.run_distance_m).toBe(start);
  });

  it("never ramps a loading week by more than the configured cap", () => {
    let lastLoad = start;
    for (const w of prog) {
      if (w.is_deload || w.phase === "taper") continue;
      if (w.week_index === 0) continue;
      const ratio = w.run_distance_m / lastLoad;
      expect(ratio).toBeLessThanOrEqual(1 + config.maxWeeklyRampPct + 1e-9);
      lastLoad = w.run_distance_m;
    }
  });

  it("inserts deloads on the configured cadence", () => {
    const deloads = prog.filter((w) => w.is_deload);
    expect(deloads.length).toBeGreaterThanOrEqual(2);
    // A deload is lighter than the week before it.
    for (const d of deloads) {
      const prev = prog[d.week_index - 1];
      if (prev) expect(d.run_distance_m).toBeLessThan(prev.run_distance_m);
    }
  });

  it("sheds volume through the taper", () => {
    const taper = prog.filter((w) => w.phase === "taper");
    expect(taper.length).toBeGreaterThan(0);
    const peak = Math.max(...prog.filter((w) => w.phase !== "taper").map((w) => w.run_distance_m));
    for (const t of taper) {
      expect(t.run_distance_m).toBeLessThan(peak);
    }
  });

  it("is deterministic", () => {
    const again = buildVolumeProgression(phases, start, config);
    expect(again).toEqual(prog);
  });
});
