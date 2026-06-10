/**
 * Hook gluing the adaptation flow together: build a proposal from a trigger
 * (or a parsed user request), stash it in the adaptation store, and open the
 * review screen. Also exposes the detect-on-load banner check.
 */

import { useCallback } from "react";
import { useRouter } from "expo-router";
import { detectTrigger, type PlanAdjustments } from "../core/engine/adaptation";
import type { AdaptationTrigger, Weekday } from "../core/types/domain";
import { usePlanStore } from "../stores/planStore";
import { useAdaptationStore } from "../stores/adaptationStore";
import {
  adjustmentsForTrigger,
  propose,
} from "./adaptationService";
import { localTodayISO } from "./format";
import { captureError } from "./telemetry";

export function useAdaptation() {
  const router = useRouter();
  const plan = usePlanStore((s) => s.plan);
  const units = usePlanStore((s) => s.units);
  const ensureGenContext = usePlanStore((s) => s.ensureGenContext);
  const { dismissed, setPending, setBusy, busy } = useAdaptationStore();

  /** The trigger the engine detects right now, unless the user dismissed it. */
  const detected: AdaptationTrigger | null =
    plan && !busy ? detectTrigger(plan, localTodayISO()) : null;
  const activeBanner = detected && !dismissed.includes(detected) ? detected : null;

  const proposeAndReview = useCallback(
    async (
      trigger: AdaptationTrigger,
      overrides?: { adjustments?: PlanAdjustments; longDay?: Weekday },
    ) => {
      if (!plan) return;
      setBusy(true);
      try {
        const context = await ensureGenContext();
        const proposal = propose(
          plan,
          context,
          trigger,
          overrides?.adjustments ?? adjustmentsForTrigger(trigger),
          units,
          localTodayISO(),
          { longDay: overrides?.longDay },
        );
        setPending(proposal);
        router.push("/adaptation-review");
      } catch (err) {
        captureError(err, { where: "proposeAndReview", trigger });
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [plan, units, ensureGenContext, setPending, setBusy, router],
  );

  return { activeBanner, proposeAndReview, busy };
}
