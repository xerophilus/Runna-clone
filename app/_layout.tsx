import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useAuthStore } from "@/stores/authStore";

export default function RootLayout() {
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#FAF7F2" } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="session/[id]"
          options={{
            headerShown: true,
            headerTitle: "",
            headerBackTitle: "Back",
            headerTintColor: "#C2572B",
            headerStyle: { backgroundColor: "#FAF7F2" },
            headerShadowVisible: false,
          }}
        />
      </Stack>
    </>
  );
}
