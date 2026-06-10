/**
 * Plan view (spec §5.3): phases as a timeline, weekly volume bars, current
 * week highlighted, goal date pinned at the end.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Screen, SectionLabel, Title } from "@/components/ui";
import { SessionCard } from "@/components/SessionCard";
import { usePlanStore } from "@/stores/planStore";
import { formatDateLong, formatDateShort, formatDistance, localTodayISO } from "@/lib/format";
import type { Phase } from "@/core/types/domain";

const PHASE_COLOR: Record<Phase, string> = {
  base: "#8FA98F",
  build: "#C2882B",
  peak: "#C2572B",
  taper: "#7B9EAE",
  maintenance: "#8FA98F",
};

export default function PlanScreen() {
  const plan = usePlanStore((s) => s.plan);
  const units = usePlanStore((s) => s.units);
  const today = localTodayISO();
  const [openWeek, setOpenWeek] = useState<string | null>(null);

  if (!plan) return null;

  const maxVolume = Math.max(...plan.weeks.map((w) => w.target_volume.run_distance), 1);
  const currentWeekId = plan.weeks.find((w) => {
    if (w.sessions.length === 0) return false;
    return (
      w.sessions[0]!.scheduled_date <= today &&
      today <= w.sessions[w.sessions.length - 1]!.scheduled_date
    );
  })?.id;

  return (
    <Screen>
      <Title>The plan</Title>
      <Text className="text-base text-slate mb-1">
        {plan.phase_structure.map((p) => `${p.phase} ${p.week_count}w`).join(" → ")}
      </Text>
      <Text className="text-sm text-slate mb-4">
        {formatDateShort(plan.start_date)} → {formatDateLong(plan.end_date)} · v{plan.version}
      </Text>

      <SectionLabel>Weeks</SectionLabel>
      {plan.weeks.map((week) => {
        const isCurrent = week.id === currentWeekId;
        const isOpen = openWeek === week.id;
        const frac = week.target_volume.run_distance / maxVolume;
        return (
          <View key={week.id}>
            <Pressable
              onPress={() => setOpenWeek(isOpen ? null : week.id)}
              className={`bg-card rounded-xl border p-3 mb-2 active:opacity-80 ${
                isCurrent ? "border-accent" : "border-line"
              }`}
            >
              <View className="flex-row items-center">
                <Text className="w-10 text-xs text-slate">W{week.week_index + 1}</Text>
                <View className="flex-1 mr-3">
                  <View className="h-2.5 rounded-full bg-paper overflow-hidden">
                    <View
                      className="h-2.5 rounded-full"
                      style={{
                        width: `${Math.max(frac * 100, 4)}%`,
                        backgroundColor: PHASE_COLOR[week.phase],
                      }}
                    />
                  </View>
                </View>
                <Text className="text-xs text-slate w-16 text-right">
                  {formatDistance(week.target_volume.run_distance, units)}
                </Text>
              </View>
              <View className="flex-row mt-1.5 items-center">
                <Text className="text-xs font-medium" style={{ color: PHASE_COLOR[week.phase] }}>
                  {week.phase}
                </Text>
                {week.is_deload ? (
                  <Text className="text-xs text-slate ml-2">deload</Text>
                ) : null}
                {isCurrent ? (
                  <Text className="text-xs text-accent font-semibold ml-2">this week</Text>
                ) : null}
              </View>
            </Pressable>
            {isOpen
              ? week.sessions.map((s) => (
                  <SessionCard key={s.id} session={s} units={units} showDate />
                ))
              : null}
          </View>
        );
      })}

      <Card className="mt-2 items-center">
        <Text className="text-sm text-slate">Goal date</Text>
        <Text className="font-serif text-xl text-ink mt-1">{formatDateLong(plan.end_date)}</Text>
      </Card>
    </Screen>
  );
}
