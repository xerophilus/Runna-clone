/**
 * Pure adaptation logic for the app layer (spec §5.5) — no I/O, no React
 * Native imports, unit-testable under node. The Supabase wiring lives in
 * adaptationService.ts.
 */

import { formatDistance } from "./format";
import { reflowPlan, type PlanAdjustments, type ReflowResult } from "../core/engine/adaptation";
import type { GeneratePlanInput, HybridScope } from "../core/engine/generatePlan";
import type {
  AdaptationTrigger,
  Plan,
  PlanDiff,
  Units,
  Weekday,
} from "../core/types/domain";
import { adjustmentToReflow, type Adjustment } from "../core/llm/contracts";

export type GenContext = Omit<GeneratePlanInput, "planId" | "startDate">;

/** Derive the hybrid scope a plan was generated with from its own weeks. */
export function inferHybrid(plan: Plan): HybridScope {
  const loading = plan.weeks.filter((w) => !w.is_deload);
  const strengthPerWeek = Math.max(0, ...loading.map((w) => w.target_volume.strength_sessions));
  const hasRuck = loading.some((w) => w.target_volume.ruck_distance > 0);
  return {
    includeStrength: strengthPerWeek > 0,
    strengthPerWeek,
    includeRuck: hasRuck,
    ruckPerWeek: hasRuck ? 1 : 0,
  };
}

/**
 * The week index reflow starts from. Past weeks are immutable (spec §5.5), and
 * we extend the same respect to the *elapsed part* of the current week: once
 * any of its sessions are behind us or logged, changes apply from next week —
 * a coach adjusts the coming block, not the run you did yesterday.
 */
export function reflowFromIndex(plan: Plan, todayISO: string): number {
  const lastIndex = Math.max(0, plan.weeks.length - 1);
  for (const w of plan.weeks) {
    if (w.sessions.length === 0) continue;
    const last = w.sessions[w.sessions.length - 1]!.scheduled_date;
    if (last < todayISO) continue; // fully in the past
    const untouched =
      w.sessions[0]!.scheduled_date >= todayISO &&
      w.sessions.every((s) => s.status === "scheduled");
    return untouched ? w.week_index : Math.min(w.week_index + 1, lastIndex);
  }
  return lastIndex;
}

/** Conservative trigger → adjustment mapping (tunable, spec §10). */
export function adjustmentsForTrigger(trigger: AdaptationTrigger): PlanAdjustments {
  switch (trigger) {
    case "manual_fatigue":
      return { volumeScale: 0.85 };
    case "missed_sessions":
      return { volumeScale: 0.9 };
    case "underperformance":
      return { volumeScale: 0.95, vdotDelta: -1 };
    case "user_request":
      return {};
  }
}

export interface Proposal {
  trigger: AdaptationTrigger;
  result: ReflowResult;
  summary: string;
}

/** Compute a proposed reflow. Pure — nothing is persisted until accepted. */
export function propose(
  plan: Plan,
  context: GenContext,
  trigger: AdaptationTrigger,
  adjustments: PlanAdjustments,
  units: Units,
  todayISO: string,
  opts: { longDay?: Weekday } = {},
): Proposal {
  const input: GeneratePlanInput = {
    ...context,
    availability: opts.longDay
      ? withLongDay(context.availability, opts.longDay)
      : context.availability,
    planId: plan.id,
    startDate: plan.start_date,
  };
  const result = reflowPlan(plan, input, reflowFromIndex(plan, todayISO), trigger, adjustments);
  return { trigger, result, summary: describeDiff(result.diff, trigger, units) };
}

/**
 * Moving the long run to a day the user doesn't currently train means that day
 * becomes a training day: swap it in for the old long day, keeping the weekly
 * day count constant.
 */
function withLongDay(
  availability: GeneratePlanInput["availability"],
  longDay: Weekday,
): GeneratePlanInput["availability"] {
  if (availability.day_prefs.includes(longDay)) {
    return { ...availability, long_day: longDay };
  }
  const oldLong = availability.long_day ?? availability.day_prefs[availability.day_prefs.length - 1];
  const day_prefs = availability.day_prefs.map((d) => (d === oldLong ? longDay : d));
  return { ...availability, day_prefs, long_day: longDay };
}

const TRIGGER_INTRO: Record<AdaptationTrigger, string> = {
  missed_sessions: "You've missed a few sessions recently, so the coming weeks ease off to absorb it.",
  underperformance: "Recent sessions have been running harder than they should, so the plan recalibrates.",
  manual_fatigue: "You flagged that you're feeling beat up, so the next block backs off.",
  user_request: "Here's the change you asked for.",
};

/** Deterministic, honest description of a diff (spec §5.5 transparency). */
export function describeDiff(diff: PlanDiff, trigger: AdaptationTrigger, units: Units): string {
  const parts: string[] = [TRIGGER_INTRO[trigger]];

  if (diff.weeks_changed.length > 0) {
    const before = avg(diff.weeks_changed.map((w) => w.before.run_distance));
    const after = avg(diff.weeks_changed.map((w) => w.after.run_distance));
    const dir = after < before ? "down" : "up";
    parts.push(
      `Weekly run volume over the next ${diff.weeks_changed.length} week${
        diff.weeks_changed.length === 1 ? "" : "s"
      } moves ${dir} from ~${formatDistance(before, units)} to ~${formatDistance(after, units)} on average.`,
    );
  } else {
    parts.push("No week-level volume changes.");
  }

  parts.push(
    diff.goal_date_changed
      ? `Goal date moves to ${diff.goal_date_after}.`
      : "Your goal date is unchanged.",
  );
  return parts.join(" ");
}

function avg(ns: number[]): number {
  return ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length;
}

/**
 * Keyword fallback for demo mode / unreachable Edge Function. Deliberately
 * narrow: anything it can't confidently match becomes a clarify, never a guess.
 */
export function parseLocally(text: string): Adjustment {
  const t = text.toLowerCase();

  const dayMatch = t.match(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/);
  if (/long run/.test(t) && /(move|shift|switch|put)/.test(t) && dayMatch) {
    return { adjustment: "shift_long_run", to_day: dayMatch[1] as string };
  }
  if (/(beat up|worn out|exhausted|too tired|burned out|dial (it )?back)/.test(t)) {
    return { adjustment: "reduce_volume", magnitude: "moderate" };
  }
  if (/(less|reduce|cut|lower|drop)\b.*(volume|mileage|miles|km|running)/.test(t)) {
    return { adjustment: "reduce_volume", magnitude: "moderate" };
  }
  if (/(slower|ease|easier|back off)\b.*(pace|goal)/.test(t)) {
    return { adjustment: "ease_goal_pace", magnitude: "moderate" };
  }
  return {
    adjustment: "clarify",
    question:
      "I can shift your long-run day, reduce volume, or ease your goal pace. Which would you like?",
  };
}

/** Turn a validated adjustment into reflow parameters + structural tweaks. */
export function adjustmentToProposalArgs(adj: Adjustment): {
  adjustments: PlanAdjustments;
  longDay?: Weekday;
  unsupported?: string;
} | { clarify: string } {
  if (adj.adjustment === "clarify") return { clarify: adj.question };
  if (adj.adjustment === "shift_long_run") {
    return { adjustments: {}, longDay: adj.to_day as Weekday };
  }
  if (adj.adjustment === "increase_hill_volume" || adj.adjustment === "travel_week") {
    return {
      adjustments: {},
      unsupported:
        adj.adjustment === "increase_hill_volume"
          ? "Hill emphasis isn't in the engine yet — it's on the list."
          : "Travel-week handling isn't wired up yet — skip those sessions and the missed-session logic will absorb them.",
    };
  }
  return { adjustments: adjustmentToReflow(adj) ?? {} };
}
