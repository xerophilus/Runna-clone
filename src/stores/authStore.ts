/**
 * Auth/user store. Holds the Supabase session plus a "demo mode" flag that
 * lets the whole app run locally (engine only, no persistence) when no
 * Supabase project is configured — the product stays explorable with zero setup.
 */

import { create } from "zustand";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { track } from "../lib/telemetry";

interface AuthState {
  initialized: boolean;
  session: AuthSession | null;
  demoMode: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<"session" | "confirm_email" | "error">;
  signOut: () => Promise<void>;
  enterDemoMode: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  initialized: false,
  session: null,
  demoMode: false,
  error: null,

  initialize: async () => {
    if (get().initialized) return;
    if (!isSupabaseConfigured) {
      set({ initialized: true });
      return;
    }
    const { data } = await supabase.auth.getSession();
    set({ session: data.session, initialized: true });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ session });
    });
  },

  signIn: async (email, password) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      set({ error: error.message });
      return false;
    }
    set({ session: data.session });
    track("sign_in");
    return true;
  },

  signUp: async (email, password) => {
    set({ error: null });
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      set({ error: error.message });
      return "error";
    }
    track("sign_up");
    if (data.session) {
      set({ session: data.session });
      return "session";
    }
    // Project requires email confirmation before a session exists.
    return "confirm_email";
  },

  signOut: async () => {
    if (get().session) await supabase.auth.signOut();
    set({ session: null, demoMode: false });
  },

  enterDemoMode: () => {
    track("demo_mode_entered");
    set({ demoMode: true });
  },
}));

/** Stable identifier for rows / engine input in either mode. */
export function currentUserId(): string {
  const { session, demoMode } = useAuthStore.getState();
  if (session) return session.user.id;
  if (demoMode) return "demo-user";
  throw new Error("No authenticated user");
}
