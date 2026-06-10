/**
 * Plan shaping for the app layer.
 *
 * The engine aligns weeks to Mondays for clean periodization. When a plan is
 * generated mid-week, the days before "today" in week 0 were never real
 * prescriptions — the user couldn't have done them — so we drop them before
 * showing/persisting. Otherwise they'd read as instantly-missed sessions and
 * fire the adaptation trigger on day one.
 */

import type { Plan } from "../core/types/domain";

export function dropPreStartSessions(plan: Plan, todayISO: string): Plan {
  const first = plan.weeks[0];
  if (!first) return plan;
  const hasPast = first.sessions.some((s) => s.scheduled_date < todayISO);
  if (!hasPast) return plan;
  return {
    ...plan,
    weeks: plan.weeks.map((w) =>
      w.week_index === 0
        ? { ...w, sessions: w.sessions.filter((s) => s.scheduled_date >= todayISO) }
        : w,
    ),
  };
}
