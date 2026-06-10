import { describe, it, expect } from "vitest";
import {
  validateSessionCopy,
  copyHasNumberDrift,
  finalizeCopy,
  templateCopy,
  validateAdjustment,
  adjustmentToReflow,
} from "./contracts";
import type { RunPrescription, StrengthPrescription } from "../types/prescription";

const run: RunPrescription = {
  type: "run",
  intent: "interval",
  blocks: [
    {
      label: "Main set",
      segments: [
        {
          repeat: 6,
          work: { measure: "distance", value: 800, target: { kind: "pace", low: 220, high: 230, unit: "sec_per_km" } },
          recovery: { measure: "time", value: 150 },
        },
      ],
    },
  ],
  est_duration_s: 2400,
};

describe("session copy validation", () => {
  it("accepts well-formed copy", () => {
    const copy = validateSessionCopy({
      title: "Interval Session",
      instructions: "6 × 800m at the target pace.",
      coaching_note: "Stay relaxed.",
    });
    expect(copy).not.toBeNull();
    expect(copy!.title).toBe("Interval Session");
  });

  it("rejects missing fields", () => {
    expect(validateSessionCopy({ title: "x" })).toBeNull();
    expect(validateSessionCopy(null)).toBeNull();
    expect(validateSessionCopy("nope")).toBeNull();
  });

  it("rejects empty title/instructions", () => {
    expect(validateSessionCopy({ title: " ", instructions: " ", coaching_note: "" })).toBeNull();
  });
});

describe("number-drift guard", () => {
  it("passes copy that references the prescription's numbers", () => {
    const copy = { title: "Intervals", instructions: "6 × 800m around 220-230 per km.", coaching_note: "Relax." };
    expect(copyHasNumberDrift(copy, run)).toBe(false);
  });

  it("catches an invented pace not in the prescription", () => {
    const copy = { title: "Intervals", instructions: "Run these at 195 per km.", coaching_note: "Go." };
    expect(copyHasNumberDrift(copy, run)).toBe(true);
  });

  it("ignores small incidental numbers like rep counts", () => {
    const copy = { title: "Intervals", instructions: "Do 6 reps, rest 2 min between.", coaching_note: "Ok." };
    expect(copyHasNumberDrift(copy, run)).toBe(false);
  });
});

describe("finalizeCopy pipeline", () => {
  it("uses model output when valid and drift-free", () => {
    const res = finalizeCopy(
      { title: "Intervals", instructions: "6 × 800m at 220-230.", coaching_note: "Relax." },
      run,
    );
    expect(res.source).toBe("model");
  });

  it("falls back to a template on schema failure", () => {
    const res = finalizeCopy({ nope: true }, run);
    expect(res.source).toBe("fallback");
    if (res.source === "fallback") expect(res.reason).toBe("schema");
  });

  it("falls back to a template on number drift", () => {
    const res = finalizeCopy(
      { title: "x", instructions: "Run at 195 per km flat.", coaching_note: "y" },
      run,
    );
    expect(res.source).toBe("fallback");
    if (res.source === "fallback") expect(res.reason).toBe("number_drift");
  });

  it("produces sensible templates per prescription type", () => {
    const strength: StrengthPrescription = {
      type: "strength",
      focus: "lower",
      exercises: [{ name: "Back Squat", sets: 5, reps: [3, 5], load: { kind: "pct_1rm", low: 80, high: 87 }, rest_s: 180 }],
      est_duration_s: 3000,
    };
    expect(templateCopy(strength).title).toContain("Strength");
  });
});

describe("adjustment parsing", () => {
  it("validates a long-run shift", () => {
    expect(validateAdjustment({ adjustment: "shift_long_run", to_day: "sun" })).toEqual({
      adjustment: "shift_long_run",
      to_day: "sun",
    });
  });

  it("rejects a bad weekday", () => {
    expect(validateAdjustment({ adjustment: "shift_long_run", to_day: "someday" })).toBeNull();
  });

  it("validates magnitude-based adjustments", () => {
    expect(validateAdjustment({ adjustment: "reduce_volume", magnitude: "moderate" })).toEqual({
      adjustment: "reduce_volume",
      magnitude: "moderate",
    });
    expect(validateAdjustment({ adjustment: "reduce_volume", magnitude: "huge" })).toBeNull();
  });

  it("supports a clarify escape hatch", () => {
    expect(validateAdjustment({ adjustment: "clarify", question: "Which day?" })).toEqual({
      adjustment: "clarify",
      question: "Which day?",
    });
  });

  it("rejects unknown adjustment kinds", () => {
    expect(validateAdjustment({ adjustment: "delete_everything" })).toBeNull();
  });

  it("maps reduce_volume to a volume scale", () => {
    const reflow = adjustmentToReflow({ adjustment: "reduce_volume", magnitude: "large" });
    expect(reflow?.volumeScale).toBeLessThan(1);
  });

  it("maps ease_goal_pace to a negative vdot delta", () => {
    const reflow = adjustmentToReflow({ adjustment: "ease_goal_pace", magnitude: "moderate" });
    expect(reflow?.vdotDelta).toBeLessThan(0);
  });

  it("returns null reflow for a clarify (no engine change)", () => {
    expect(adjustmentToReflow({ adjustment: "clarify", question: "?" })).toBeNull();
  });
});
