import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/stores/authStore";
import { usePlanStore } from "@/stores/planStore";

export default function TabsLayout() {
  const { session, demoMode, initialized } = useAuthStore();
  const phase = usePlanStore((s) => s.phase);

  if (initialized && !session && !demoMode) return <Redirect href="/(auth)/sign-in" />;
  if (phase !== "ready") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#C2572B",
        tabBarInactiveTintColor: "#6B6560",
        tabBarStyle: { backgroundColor: "#FFFFFF", borderTopColor: "#E7E0D8" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
