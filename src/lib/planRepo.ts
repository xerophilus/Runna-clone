/**
 * Plan persistence (spec §4 data model).
 *
 * The engine emits deterministic string IDs; Postgres rows use UUIDs. This
 * repo remaps engine output onto fresh UUIDs at save time and returns the
 * remapped Plan, so everything the app holds matches the database rows.
 */

import { randomUUID } from "expo-crypto";
import { supabase } from "./supabase";
import type {
  EffortFlag,
  FitnessBaseline,
  Availability,
  Goal,
  Plan,
  Session,
  SessionStatus,
  Units,
  Week,
} from "../core/types/domain";

export async function upsertProfile(args: {
  userId: string;
  displayName?: string;
  units: Units;
  baseline: FitnessBaseline;
  availability: Availability;
}): Promise<void> {
  const { error } = await supabase.from("users").upsert({
    id: args.userId,
    display_name: args.displayName ?? null,
    units: args.units,
    fitness_baseline: args.baseline,
    availability: args.availability,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function insertGoal(userId: string, goal: Omit<Goal, "id">): Promise<string> {
  const { data, error } = await supabase
    .from("goals")
    .insert({
      user_id: userId,
      type: goal.type,
      detail: goal.detail,
      goal_date: goal.goal_date,
      status: goal.status,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Remap engine IDs → UUIDs and persist plan + weeks + sessions. */
export async function savePlan(plan: Plan): Promise<Plan> {
  const planId = randomUUID();

  const remappedWeeks: Week[] = plan.weeks.map((week) => {
    const weekId = randomUUID();
    const sessions: Session[] = week.sessions.map((s) => ({
      ...s,
      id: randomUUID(),
      week_id: weekId,
      plan_id: planId,
    }));
    return { ...week, id: weekId, plan_id: planId, sessions };
  });
  const remapped: Plan = { ...plan, id: planId, weeks: remappedWeeks };

  const { error: planError } = await supabase.from("plans").insert({
    id: planId,
    user_id: remapped.user_id,
    goal_id: remapped.goal_id,
    start_date: remapped.start_date,
    end_date: remapped.end_date,
    phase_structure: remapped.phase_structure,
    status: remapped.status,
    version: remapped.version,
  });
  if (planError) throw planError;

  const { error: weeksError } = await supabase.from("weeks").insert(
    remappedWeeks.map((w) => ({
      id: w.id,
      plan_id: planId,
      week_index: w.week_index,
      phase: w.phase,
      target_volume: w.target_volume,
      is_deload: w.is_deload,
    })),
  );
  if (weeksError) throw weeksError;

  const sessionRows = remappedWeeks.flatMap((w) =>
    w.sessions.map((s) => ({
      id: s.id,
      week_id: s.week_id,
      plan_id: planId,
      type: s.type,
      scheduled_date: s.scheduled_date,
      prescription: s.prescription,
      display: s.display,
      status: s.status,
      effort_flag: s.effort_flag,
    })),
  );
  const { error: sessionsError } = await supabase.from("sessions").insert(sessionRows);
  if (sessionsError) throw sessionsError;

  return remapped;
}

/** Load the user's active plan with weeks + sessions, or null. */
export async function loadActivePlan(userId: string): Promise<Plan | null> {
  const { data: planRow, error: planError } = await supabase
    .from("plans")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (planError) throw planError;
  if (!planRow) return null;

  const { data: weekRows, error: weeksError } = await supabase
    .from("weeks")
    .select("*")
    .eq("plan_id", planRow.id)
    .order("week_index");
  if (weeksError) throw weeksError;

  const { data: sessionRows, error: sessionsError } = await supabase
    .from("sessions")
    .select("*")
    .eq("plan_id", planRow.id)
    .order("scheduled_date");
  if (sessionsError) throw sessionsError;

  const sessionsByWeek = new Map<string, Session[]>();
  for (const row of sessionRows ?? []) {
    const session: Session = {
      id: row.id,
      week_id: row.week_id,
      plan_id: row.plan_id,
      type: row.type,
      scheduled_date: row.scheduled_date,
      prescription: row.prescription,
      display: row.display,
      status: row.status,
      effort_flag: row.effort_flag,
    };
    const list = sessionsByWeek.get(row.week_id) ?? [];
    list.push(session);
    sessionsByWeek.set(row.week_id, list);
  }

  const weeks: Week[] = (weekRows ?? []).map((row) => ({
    id: row.id,
    plan_id: row.plan_id,
    week_index: row.week_index,
    phase: row.phase,
    target_volume: row.target_volume,
    is_deload: row.is_deload,
    sessions: sessionsByWeek.get(row.id) ?? [],
  }));

  return {
    id: planRow.id,
    user_id: planRow.user_id,
    goal_id: planRow.goal_id,
    start_date: planRow.start_date,
    end_date: planRow.end_date,
    phase_structure: planRow.phase_structure,
    status: planRow.status,
    version: planRow.version,
    weeks,
  };
}

/** Manual logging (spec §5.4): mark complete/skipped and record an activity. */
export async function logSession(args: {
  userId: string;
  session: Session;
  status: Extract<SessionStatus, "completed" | "skipped">;
  effortFlag: EffortFlag | null;
  rpe: number | null;
}): Promise<void> {
  const { error } = await supabase
    .from("sessions")
    .update({ status: args.status, effort_flag: args.effortFlag })
    .eq("id", args.session.id);
  if (error) throw error;

  if (args.status === "completed") {
    const { error: actError } = await supabase.from("activities").insert({
      user_id: args.userId,
      session_id: args.session.id,
      source: "manual",
      type: args.session.type,
      started_at: `${args.session.scheduled_date}T12:00:00Z`,
      duration_s: args.session.prescription.est_duration_s,
      metrics: {},
      rpe: args.rpe,
    });
    if (actError) throw actError;
  }
}
