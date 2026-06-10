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
import type {
  EffortFlag,
  Plan,
  Session,
  SessionStatus,
  Units,
} from "../core/types/domain";
import * as repo from "../lib/planRepo";
import { localTodayISO } from "../lib/format";
import { track, captureError } from "../lib/telemetry";

type PlanPhase = "unknown" | "loading" | "none" | "ready" | "error";

interface PlanState {
  phase: PlanPhase;
  plan: Plan | null;
  units: Units;
  error: string | null;

  setUnits: (units: Units) => void;
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

  setUnits: (units) => set({ units }),

  loadForUser: async (userId) => {
    set({ phase: "loading", error: null });
    try {
      const plan = await repo.loadActivePlan(userId);
      set({ plan, phase: plan ? "ready" : "none" });
    } catch (err) {
      captureError(err, { where: "loadForUser" });
      set({ phase: "error", error: String(err) });
    }
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
      let plan = generatePlan(input);
      if (args.persist) plan = await repo.savePlan(plan);

      track("plan_generated", {
        goal_type: args.goal.type,
        weeks: plan.weeks.length,
        persisted: args.persist,
      });
      set({ plan, units: args.units, phase: "ready" });
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
