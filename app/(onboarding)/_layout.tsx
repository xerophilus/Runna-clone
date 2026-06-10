import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function OnboardingLayout() {
  const { session, demoMode, initialized } = useAuthStore();
  if (initialized && !session && !demoMode) return <Redirect href="/(auth)/sign-in" />;
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: "",
        headerBackTitle: "Back",
        headerTintColor: "#C2572B",
        headerStyle: { backgroundColor: "#FAF7F2" },
        headerShadowVisible: false,
      }}
    />
  );
}
