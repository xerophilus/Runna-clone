/**
 * Session copywriting client wiring (spec §5.2 Layer 2, §7 task 1).
 *
 * Calls the session-copy Edge Function for sessions that don't have display
 * copy yet, runs the model output through the same guard pipeline the server
 * uses (schema + number-drift, src/core/llm/contracts), caches accepted copy
 * into sessions.display, and returns the updated plan.
 *
 * Failure is always graceful: the UI renders deterministic titles/instructions
 * from the prescription when display is null, so an unreachable function or a
 * rejected output costs nothing but polish.
 */

import { supabase } from "./supabase";
import { finalizeCopy } from "../core/llm/contracts";
import type { Plan, Session, SessionDisplay } from "../core/types/domain";

async function fetchCopy(session: Session, plan: Plan): Promise<SessionDisplay | null> {
  const week = plan.weeks.find((w) => w.id === session.week_id);
  const { data, error } = await supabase.functions.invoke("session-copy", {
    body: {
      prescription: session.prescription,
      context: {
        phase: week?.phase,
        week_index: week?.week_index,
        is_deload: week?.is_deload,
      },
    },
  });
  if (error || !data) return null;

  // Trust nothing: re-validate and drift-check on the client as well.
  const result = finalizeCopy(data, session.prescription);
  return result.source === "model" ? result.copy : null;
}

/**
 * Hydrate copy for one week's sessions. Returns the updated plan, or null if
 * nothing changed. `persist` writes accepted copy back to the sessions rows.
 */
export async function hydrateWeekCopy(
  plan: Plan,
  weekIndex: number,
  persist: boolean,
): Promise<Plan | null> {
  const week = plan.weeks.find((w) => w.week_index === weekIndex);
  if (!week) return null;

  const targets = week.sessions.filter((s) => !s.display && s.prescription.type !== "rest");
  if (targets.length === 0) return null;

  const results = await Promise.all(
    targets.map(async (s) => ({ id: s.id, display: await fetchCopy(s, plan) })),
  );
  const accepted = results.filter((r): r is { id: string; display: SessionDisplay } =>
    Boolean(r.display),
  );
  if (accepted.length === 0) return null;

  if (persist) {
    await Promise.all(
      accepted.map((r) =>
        supabase.from("sessions").update({ display: r.display }).eq("id", r.id),
      ),
    );
  }

  const byId = new Map(accepted.map((r) => [r.id, r.display]));
  return {
    ...plan,
    weeks: plan.weeks.map((w) =>
      w.id === week.id
        ? {
            ...w,
            sessions: w.sessions.map((s) =>
              byId.has(s.id) ? { ...s, display: byId.get(s.id)! } : s,
            ),
          }
        : w,
    ),
  };
}
