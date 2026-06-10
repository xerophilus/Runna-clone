/**
 * Adaptation flow state (spec §5.5).
 *
 * Holds the *pending proposal* between computing a reflow and the user
 * accepting it on the review screen — adaptation never applies behind the
 * user's back when it crosses the consent threshold.
 */

import { create } from "zustand";
import type { AdaptationTrigger } from "../core/types/domain";
import type { Proposal } from "../lib/adaptationService";

interface AdaptationState {
  pending: Proposal | null;
  /** triggers the user dismissed this session, so the banner doesn't nag */
  dismissed: AdaptationTrigger[];
  busy: boolean;

  setPending: (p: Proposal | null) => void;
  dismiss: (t: AdaptationTrigger) => void;
  setBusy: (b: boolean) => void;
}

export const useAdaptationStore = create<AdaptationState>((set) => ({
  pending: null,
  dismissed: [],
  busy: false,
  setPending: (pending) => set({ pending }),
  dismiss: (t) => set((s) => ({ dismissed: [...s.dismissed, t], pending: null })),
  setBusy: (busy) => set({ busy }),
}));
