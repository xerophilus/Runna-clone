/**
 * Progress dashboard (spec §5.6): adherence, streak, volume vs plan.
 * Honest and non-gamified — completed volume counts only logged sessions.
 */

import { Text, View } from "react-native";
import { Card, Screen, SectionLabel, Title, Button } from "@/components/ui";
import { usePlanStore } from "@/stores/planStore";
import { useAuthStore } from "@/stores/authStore";
import { formatDistance, localTodayISO, runTotalDistance } from "@/lib/format";
import type { Session } from "@/core/types/domain";

function sessionRunMeters(s: Session): number {
  if (s.prescription.type === "run") return runTotalDistance(s.prescription);
  if (s.prescription.type === "ruck") return s.prescription.distance_m;
  return 0;
}

export default function ProgressScreen() {
  const plan = usePlanStore((s) => s.plan);
  const units = usePlanStore((s) => s.units);
  const signOut = useAuthStore((s) => s.signOut);
  const clear = usePlanStore((s) => s.clear);
  if (!plan) return null;

  const today = localTodayISO();
  const all = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.prescription.type !== "rest");
  const due = all.filter((s) => s.scheduled_date <= today);
  const completed = due.filter((s) => s.status === "completed");
  const skipped = due.filter((s) => s.status === "skipped");
  const adherence = due.length > 0 ? Math.round((completed.length / due.length) * 100) : null;

  // Streak: consecutive most-recent due sessions completed.
  let streak = 0;
  for (let i = due.length - 1; i >= 0; i--) {
    const s = due[i]!;
    if (s.status === "completed") streak++;
    else if (s.status === "skipped") break;
    else continue; // still merely scheduled (e.g. today) — doesn't break the streak
  }

  const weekRows = plan.weeks.map((w) => {
    const target = w.target_volume.run_distance;
    const done = w.sessions
      .filter((s) => s.status === "completed")
      .reduce((acc, s) => acc + sessionRunMeters(s), 0);
    return { week: w, target, done };
  });
  const maxTarget = Math.max(...weekRows.map((r) => r.target), 1);

  const status =
    adherence === null
      ? { label: "Just getting started", color: "#6B6560" }
      : adherence >= 80
        ? { label: "On track", color: "#4D6A4F" }
        : adherence >= 60
          ? { label: "A little behind", color: "#C9A227" }
          : { label: "Behind plan", color: "#B3402A" };

  return (
    <Screen>
      <Title>Progress</Title>

      <Card className="mb-3">
        <Text className="text-sm text-slate">Readiness</Text>
        <Text className="font-serif text-2xl mt-1" style={{ color: status.color }}>
          {status.label}
        </Text>
        {adherence !== null ? (
          <Text className="text-sm text-slate mt-1">
            {completed.length} of {due.length} sessions completed · {skipped.length} skipped
          </Text>
        ) : (
          <Text className="text-sm text-slate mt-1">
            Log your first sessions and this gets honest fast.
          </Text>
        )}
      </Card>

      <View className="flex-row">
        <Card className="flex-1 mr-2 items-center">
          <Text className="font-serif text-3xl text-ink">{adherence ?? "—"}%</Text>
          <Text className="text-xs text-slate mt-1">adherence</Text>
        </Card>
        <Card className="flex-1 ml-2 items-center">
          <Text className="font-serif text-3xl text-ink">{streak}</Text>
          <Text className="text-xs text-slate mt-1">session streak</Text>
        </Card>
      </View>

      <SectionLabel>Weekly volume · done vs plan</SectionLabel>
      <Card>
        {weekRows.map(({ week, target, done }) => (
          <View key={week.id} className="flex-row items-center mb-2">
            <Text className="w-9 text-xs text-slate">W{week.week_index + 1}</Text>
            <View className="flex-1 mr-2">
              <View className="h-2 rounded-full bg-paper overflow-hidden">
                <View
                  className="h-2 rounded-full bg-line"
                  style={{ width: `${(target / maxTarget) * 100}%` }}
                />
              </View>
              <View className="h-2 rounded-full overflow-hidden -mt-2">
                <View
                  className="h-2 rounded-full bg-moss"
                  style={{ width: `${Math.min((done / maxTarget) * 100, 100)}%` }}
                />
              </View>
            </View>
            <Text className="text-xs text-slate w-20 text-right">
              {formatDistance(done, units)} / {formatDistance(target, units)}
            </Text>
          </View>
        ))}
      </Card>

      <SectionLabel>Account</SectionLabel>
      <Button
        label="Sign out"
        variant="secondary"
        onPress={() => {
          void signOut();
          clear();
        }}
      />
    </Screen>
  );
}
