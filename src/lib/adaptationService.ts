/**
 * Adaptation I/O (spec §5.5): everything here touches Supabase. The pure
 * logic — trigger mapping, reflow boundaries, diff summaries, the keyword
 * parse fallback — lives in adaptationLogic.ts and is unit-tested.
 */

import { supabase } from "./supabase";
import * as repo from "./planRepo";
import { localTodayISO } from "./format";
import { inferHybrid, reflowFromIndex, type GenContext, type Proposal } from "./adaptationLogic";
import type { Plan } from "../core/types/domain";
import { validateAdjustment, type Adjustment } from "../core/llm/contracts";

export * from "./adaptationLogic";

/** Rebuild the engine input for a persisted plan from users + goals rows. */
export async function loadGenContext(plan: Plan): Promise<GenContext> {
  const { data: userRow, error: userError } = await supabase
    .from("users")
    .select("fitness_baseline, availability")
    .eq("id", plan.user_id)
    .single();
  if (userError) throw userError;

  const { data: goalRow, error: goalError } = await supabase
    .from("goals")
    .select("*")
    .eq("id", plan.goal_id)
    .single();
  if (goalError) throw goalError;

  return {
    userId: plan.user_id,
    goal: {
      id: goalRow.id,
      type: goalRow.type,
      detail: goalRow.detail,
      goal_date: goalRow.goal_date,
      status: goalRow.status,
    },
    baseline: userRow.fitness_baseline ?? {},
    availability: userRow.availability,
    hybrid: inferHybrid(plan),
  };
}

/** Persist an accepted reflow: save v(N+1), supersede vN, record the adaptation. */
export async function applyPersist(oldPlan: Plan, proposal: Proposal): Promise<Plan> {
  const saved = await repo.savePlan(proposal.result.plan);
  await repo.supersedePlan(oldPlan.id);
  await repo.insertAdaptation({
    planId: saved.id,
    trigger: proposal.trigger,
    summary: proposal.summary,
    changes: proposal.result.diff,
  });
  return saved;
}

/** Server parse via the parse-adjustment Edge Function (spec §7 task 2). */
export async function parseViaEdge(text: string, plan: Plan): Promise<Adjustment | null> {
  const { data, error } = await supabase.functions.invoke("parse-adjustment", {
    body: {
      text,
      plan_context: {
        phase_structure: plan.phase_structure,
        weeks_remaining: plan.weeks.length - reflowFromIndex(plan, localTodayISO()),
      },
    },
  });
  if (error) return null;
  return validateAdjustment(data);
}
