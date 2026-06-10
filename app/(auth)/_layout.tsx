import { Redirect, Stack } from "expo-router";
import { useAuthStore } from "@/stores/authStore";

export default function AuthLayout() {
  const { session, demoMode } = useAuthStore();
  if (session || demoMode) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
