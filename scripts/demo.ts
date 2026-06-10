/**
 * Demo / eyeball harness (spec §8 step 3: "Render a raw plan view to verify
 * periodization by eye"). Run with: `npm run demo`.
 *
 * Generates a marathon plan and prints the phase structure, weekly volume
 * progression, and one example week so the periodization can be sanity-checked
 * without any UI.
 */

import { generatePlan, type GeneratePlanInput } from "../src/core/engine/generatePlan.js";
import { pacesFromVdot } from "../src/core/engine/vdot.js";
import { DEFAULT_CONFIG } from "../src/core/engine/config.js";
import { finalizeCopy } from "../src/core/llm/contracts.js";
import type { Goal } from "../src/core/types/domain.js";

const goal: Goal = {
  id: "demo-goal",
  type: "race",
  detail: { distance: 42195, target_time: 3 * 3600 + 30 * 60 },
  goal_date: "2026-09-28",
  status: "active",
};

const input: GeneratePlanInput = {
  planId: "demo-plan",
  userId: "demo-user",
  goal,
  baseline: { vdot: 50, current_weekly_run_m: 45_000, lifts: { squat: 140, deadlift: 180 } },
  availability: {
    days_per_week: 6,
    day_prefs: ["mon", "tue", "wed", "thu", "fri", "sun"],
    long_day: "sun",
    minutes_per_session: 75,
    equipment: ["full_gym"],
  },
  startDate: "2026-06-08",
  config: DEFAULT_CONFIG,
  hybrid: { includeStrength: true, strengthPerWeek: 2, includeRuck: false, ruckPerWeek: 0 },
};

const km = (m: number) => (m / 1000).toFixed(1);
const pace = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const plan = generatePlan(input);
const paces = pacesFromVdot(input.baseline.vdot!, DEFAULT_CONFIG);

console.log("\n=== TRAINING PACES (VDOT %d) ===".replace("%d", String(input.baseline.vdot)));
for (const [zone, r] of Object.entries(paces)) {
  console.log(`  ${zone.padEnd(11)} ${pace(r.low)}–${pace(r.high)} /km`);
}

console.log("\n=== PHASE STRUCTURE ===");
console.log("  " + plan.phase_structure.map((p) => `${p.phase}(${p.week_count})`).join(" → "));

console.log("\n=== WEEKLY VOLUME PROGRESSION ===");
for (const w of plan.weeks) {
  const bar = "█".repeat(Math.round(w.target_volume.run_distance / 4000));
  const tag = w.is_deload ? " [deload]" : "";
  console.log(
    `  W${String(w.week_index).padStart(2)} ${w.phase.padEnd(11)} ${km(w.target_volume.run_distance).padStart(5)}km ${bar}${tag}`,
  );
}

console.log("\n=== EXAMPLE WEEK (a build week) ===");
const example = plan.weeks.find((w) => w.phase === "build" && !w.is_deload)!;
for (const s of example.sessions) {
  const copy = finalizeCopy(null, s.prescription); // null → deterministic template
  console.log(`  ${s.scheduled_date}  ${s.type.padEnd(8)} ${copy.copy.title}`);
}

console.log("");
