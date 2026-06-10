/**
 * Entry decider: waits for auth init, then routes to sign-in, onboarding
 * (no active plan yet), or the main tabs.
 */

import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuthStore } from "@/stores/authStore";
import { usePlanStore } from "@/stores/planStore";

export default function Index() {
  const { initialized, session, demoMode } = useAuthStore();
  const { phase, loadForUser } = usePlanStore();

  const signedIn = Boolean(session) || demoMode;

  useEffect(() => {
    if (session && phase === "unknown") {
      void loadForUser(session.user.id);
    }
  }, [session, phase, loadForUser]);

  if (!initialized) return <Loading />;
  if (!signedIn) return <Redirect href="/(auth)/sign-in" />;

  // Demo mode skips persistence: a generated plan lives in the store only.
  if (demoMode) {
    return phase === "ready" ? <Redirect href="/(tabs)" /> : <Redirect href="/(onboarding)/goal" />;
  }

  if (phase === "unknown" || phase === "loading") return <Loading />;
  if (phase === "none" || phase === "error") return <Redirect href="/(onboarding)/goal" />;
  return <Redirect href="/(tabs)" />;
}

function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-paper">
      <ActivityIndicator size="large" color="#C2572B" />
    </View>
  );
}
