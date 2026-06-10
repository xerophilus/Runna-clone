/**
 * Plan store — the app's single source of truth for the active plan.
 *
 * Generation runs the shared deterministic engine (src/core/engine) and
 * persists through planRepo when a Supabase session exists; in demo mode the
 * plan lives in memory only. Logging updates both the row and the in-memory
 * plan so the UI is immediately consistent.
 */

import { create } from "zustand";
import { randomUUID } from "expo-crypto";
import { generatePlan, type GeneratePlanInput } from "../core/engine/generatePlan";
import {
  applyPersist,
  loadGenContext,
  type GenContext,
  type Proposal,
} from "../lib/adaptationService";
import type {
  EffortFlag,
  Plan,
  Session,
  SessionStatus,
  Units,
} from "../core/types/domain";
import * as repo from "../lib/planRepo";
import { dropPreStartSessions } from "../lib/planUtils";
import { hydrateWeekCopy } from "../lib/copyService";
import { localTodayISO } from "../lib/format";
import { track, captureError } from "../lib/telemetry";

type PlanPhase = "unknown" | "loading" | "none" | "ready" | "error";

interface PlanState {
  phase: PlanPhase;
  plan: Plan | null;
  units: Units;
  error: string | null;
  /** Engine input the plan was generated with; lazily rebuilt for loaded plans. */
  genContext: GenContext | null;

  setUnits: (units: Units) => void;
  /** Returns the generation context, rebuilding it from DB rows if needed. */
  ensureGenContext: () => Promise<GenContext>;
  /** Swap in an accepted reflow (persisting it first unless demo mode). */
  applyProposal: (proposal: Proposal, persist: boolean) => Promise<void>;
  /** Fire-and-forget LLM copy hydration for the current week (spec §7 task 1). */
  hydrateCurrentWeekCopy: () => void;
  loadForUser: (userId: string) => Promise<void>;
  generateForUser: (args: {
    userId: string;
    persist: boolean;
    goal: Omit<GeneratePlanInput["goal"], "id">;
    baseline: GeneratePlanInput["baseline"];
    availability: GeneratePlanInput["availability"];
    hybrid: GeneratePlanInput["hybrid"];
    units: Units;
    displayName?: string;
  }) => Promise<void>;
  logSession: (args: {
    sessionId: string;
    status: Extract<SessionStatus, "completed" | "skipped">;
    effortFlag: EffortFlag | null;
    rpe: number | null;
    persist: boolean;
    userId: string;
  }) => Promise<void>;
  clear: () => void;
}

function withSessionPatched(
  plan: Plan,
  sessionId: string,
  patch: Partial<Session>,
): Plan {
  return {
    ...plan,
    weeks: plan.weeks.map((w) =>
      w.sessions.some((s) => s.id === sessionId)
        ? {
            ...w,
            sessions: w.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
          }
        : w,
    ),
  };
}

export const usePlanStore = create<PlanState>((set, get) => ({
  phase: "unknown",
  plan: null,
  units: "imperial",
  error: null,
  genContext: null,

  setUnits: (units) => set({ units }),

  ensureGenContext: async () => {
    const { genContext, plan } = get();
    if (genContext) return genContext;
    if (!plan) throw new Error("No active plan");
    const rebuilt = await loadGenContext(plan);
    set({ genContext: rebuilt });
    return rebuilt;
  },

  applyProposal: async (proposal, persist) => {
    const { plan } = get();
    if (!plan) return;
    if (persist) {
      const saved = await applyPersist(plan, proposal);
      set({ plan: saved });
    } else {
      set({ plan: proposal.result.plan });
    }
    track("adaptation_applied", {
      trigger: proposal.trigger,
      requires_consent: proposal.result.diff.requires_consent,
    });
  },

  loadForUser: async (userId) => {
    set({ phase: "loading", error: null });
    try {
      const plan = await repo.loadActivePlan(userId);
      set({ plan, phase: plan ? "ready" : "none" });
      if (plan) get().hydrateCurrentWeekCopy();
    } catch (err) {
      captureError(err, { where: "loadForUser" });
      set({ phase: "error", error: String(err) });
    }
  },

  hydrateCurrentWeekCopy: () => {
    const { plan } = get();
    if (!plan) return;
    const today = localTodayISO();
    const current =
      plan.weeks.find((w) => {
        if (w.sessions.length === 0) return false;
        return w.sessions[w.sessions.length - 1]!.scheduled_date >= today;
      }) ?? plan.weeks[0];
    if (!current) return;
    void hydrateWeekCopy(plan, current.week_index, true)
      .then((updated) => {
        // Don't clobber a plan that changed while the request was in flight.
        if (updated && get().plan?.id === plan.id) set({ plan: updated });
      })
      .catch((err) => captureError(err, { where: "hydrateCurrentWeekCopy" }));
  },

  generateForUser: async (args) => {
    set({ phase: "loading", error: null });
    try {
      let goalId = randomUUID();
      if (args.persist) {
        await repo.upsertProfile({
          userId: args.userId,
          displayName: args.displayName,
          units: args.units,
          baseline: args.baseline,
          availability: args.availability,
        });
        goalId = await repo.insertGoal(args.userId, { ...args.goal, status: "active" });
      }

      const input: GeneratePlanInput = {
        planId: randomUUID(),
        userId: args.userId,
        goal: { ...args.goal, id: goalId, status: "active" },
        baseline: args.baseline,
        availability: args.availability,
        hybrid: args.hybrid,
        startDate: localTodayISO(),
      };
      let plan = dropPreStartSessions(generatePlan(input), localTodayISO());
      if (args.persist) plan = await repo.savePlan(plan);
      if (args.persist) setTimeout(() => get().hydrateCurrentWeekCopy(), 0);

      track("plan_generated", {
        goal_type: args.goal.type,
        weeks: plan.weeks.length,
        persisted: args.persist,
      });
      set({
        plan,
        units: args.units,
        phase: "ready",
        genContext: {
          userId: args.userId,
          goal: input.goal,
          baseline: args.baseline,
          availability: args.availability,
          hybrid: args.hybrid,
        },
      });
    } catch (err) {
      captureError(err, { where: "generateForUser" });
      set({ phase: "error", error: String(err) });
      throw err;
    }
  },

  logSession: async ({ sessionId, status, effortFlag, rpe, persist, userId }) => {
    const { plan } = get();
    if (!plan) return;
    const session = plan.weeks.flatMap((w) => w.sessions).find((s) => s.id === sessionId);
    if (!session) return;

    // Optimistic local update; the single tap must stay frictionless (spec §5.4).
    set({ plan: withSessionPatched(plan, sessionId, { status, effort_flag: effortFlag }) });
    track("session_logged", { status, effort: effortFlag, type: session.type });

    if (persist) {
      try {
        await repo.logSession({ userId, session, status, effortFlag, rpe });
      } catch (err) {
        captureError(err, { where: "logSession" });
        // Roll back on failure so the UI never lies about persisted state.
        set({ plan: withSessionPatched(get().plan!, sessionId, {
          status: session.status,
          effort_flag: session.effort_flag,
        }) });
        throw err;
      }
    }
  },

  clear: () => set({ plan: null, phase: "unknown", error: null }),
}));
