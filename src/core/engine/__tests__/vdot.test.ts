import { describe, it, expect } from "vitest";
import { DEFAULT_CONFIG } from "../config.js";
import {
  vdotFromRace,
  vdotFromEasyPace,
  pacesFromVdot,
  velocityFromVo2,
  vo2FromVelocity,
} from "../vdot.js";

describe("VDOT computation", () => {
  it("recovers a plausible VDOT from a 5k race", () => {
    // 20:00 5k is a well-known ~VDOT 49-50 performance.
    const vdot = vdotFromRace(5000, 20 * 60);
    expect(vdot).toBeGreaterThan(46);
    expect(vdot).toBeLessThan(53);
  });

  it("recovers a plausible VDOT from a sub-3 marathon", () => {
    const vdot = vdotFromRace(42195, 2 * 3600 + 55 * 60);
    expect(vdot).toBeGreaterThan(50);
    expect(vdot).toBeLessThan(62);
  });

  it("is monotonic: a faster race yields a higher VDOT", () => {
    const slow = vdotFromRace(5000, 25 * 60);
    const fast = vdotFromRace(5000, 18 * 60);
    expect(fast).toBeGreaterThan(slow);
  });

  it("rejects non-positive inputs", () => {
    expect(() => vdotFromRace(0, 600)).toThrow();
    expect(() => vdotFromRace(5000, 0)).toThrow();
  });

  it("vo2/velocity inversion round-trips", () => {
    const v = 250; // m/min
    const vo2 = vo2FromVelocity(v);
    expect(velocityFromVo2(vo2)).toBeCloseTo(v, 1);
  });

  it("estimates VDOT from self-reported easy pace", () => {
    const vdot = vdotFromEasyPace(330, DEFAULT_CONFIG); // 5:30/km easy
    expect(vdot).toBeGreaterThan(30);
    expect(vdot).toBeLessThan(55);
  });
});

describe("pace derivation", () => {
  it("orders paces correctly (repetition fastest, easy slowest)", () => {
    const p = pacesFromVdot(50, DEFAULT_CONFIG);
    // lower sec/km = faster
    expect(p.repetition.low).toBeLessThan(p.interval.low);
    expect(p.interval.low).toBeLessThan(p.threshold.low);
    expect(p.threshold.low).toBeLessThan(p.marathon.low);
    expect(p.marathon.low).toBeLessThan(p.easy.low);
  });

  it("returns ranges, not points", () => {
    const p = pacesFromVdot(50, DEFAULT_CONFIG);
    expect(p.easy.high).toBeGreaterThan(p.easy.low);
    expect(p.threshold.unit).toBe("sec_per_km");
  });

  it("faster runners get faster paces at every zone", () => {
    const slow = pacesFromVdot(40, DEFAULT_CONFIG);
    const fast = pacesFromVdot(60, DEFAULT_CONFIG);
    expect(fast.easy.low).toBeLessThan(slow.easy.low);
    expect(fast.threshold.low).toBeLessThan(slow.threshold.low);
  });
});
