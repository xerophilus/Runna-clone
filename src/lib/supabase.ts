/**
 * Supabase client (spec §3). The client holds only the public anon key; all
 * LLM calls happen in Edge Functions which hold the Anthropic key.
 *
 * When EXPO_PUBLIC_SUPABASE_URL is absent the app still boots — auth screens
 * surface the misconfiguration and "demo mode" lets the engine run locally
 * without persistence, so the product is explorable with zero setup.
 */

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Guard storage so importing this module never touches window/AsyncStorage
// in a server-render or test environment.
const canPersist = typeof window !== "undefined";

export const supabase = createClient(
  url ?? "https://placeholder.supabase.co",
  anonKey ?? "placeholder-anon-key",
  {
    auth: {
      ...(canPersist ? { storage: AsyncStorage } : {}),
      autoRefreshToken: canPersist,
      persistSession: canPersist,
      detectSessionInUrl: false,
    },
  },
);
