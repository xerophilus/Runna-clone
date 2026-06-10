/**
 * Onboarding 4: availability (spec §5.1) — training days, the long day,
 * session length, equipment, and how much strength to include (the hybrid
 * scope decision from spec §10 surfaces here as a user choice).
 */

import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  Button,
  Chip,
  Screen,
  SectionLabel,
  Subtitle,
  Title,
} from "@/components/ui";
import { useOnboardingStore } from "@/stores/onboardingStore";
import type { Equipment, Weekday } from "@/core/types/domain";

const DAYS: { label: string; value: Weekday }[] = [
  { label: "Mon", value: "mon" },
  { label: "Tue", value: "tue" },
  { label: "Wed", value: "wed" },
  { label: "Thu", value: "thu" },
  { label: "Fri", value: "fri" },
  { label: "Sat", value: "sat" },
  { label: "Sun", value: "sun" },
];

const EQUIPMENT: { label: string; value: Equipment }[] = [
  { label: "None", value: "none" },
  { label: "Dumbbells", value: "dumbbells" },
  { label: "Full gym", value: "full_gym" },
  { label: "Rucksack", value: "rucksack" },
];

const MINUTES = [45, 60, 75, 90];

export default function AvailabilityScreen() {
  const router = useRouter();
  const ob = useOnboardingStore();

  const toggleDay = (day: Weekday) => {
    const has = ob.dayPrefs.includes(day);
    const next = has ? ob.dayPrefs.filter((d) => d !== day) : [...ob.dayPrefs, day];
    const patch: Parameters<typeof ob.set>[0] = { dayPrefs: next };
    if (has && ob.longDay === day && next.length > 0) patch.longDay = next[next.length - 1];
    ob.set(patch);
  };

  const toggleEquipment = (eq: Equipment) => {
    const has = ob.equipment.includes(eq);
    let next = has ? ob.equipment.filter((e) => e !== eq) : [...ob.equipment, eq];
    if (eq !== "none" && !has) next = next.filter((e) => e !== "none");
    if (next.length === 0) next = ["none"];
    if (eq === "none" && !has) next = ["none", ...ob.equipment.filter((e) => e === "rucksack")];
    ob.set({ equipment: next });
  };

  const canContinue = ob.dayPrefs.length >= 3;

  return (
    <Screen>
      <Title>When can you train?</Title>
      <Subtitle>The plan protects hard/easy spacing and puts your long run where it fits.</Subtitle>

      <SectionLabel>Training days ({ob.dayPrefs.length})</SectionLabel>
      <View className="flex-row flex-wrap">
        {DAYS.map((d) => (
          <Chip
            key={d.value}
            label={d.label}
            selected={ob.dayPrefs.includes(d.value)}
            onPress={() => toggleDay(d.value)}
          />
        ))}
      </View>
      {!canContinue ? (
        <Text className="text-sm text-slate">Pick at least three days.</Text>
      ) : null}

      <SectionLabel>Long run day</SectionLabel>
      <View className="flex-row flex-wrap">
        {DAYS.filter((d) => ob.dayPrefs.includes(d.value)).map((d) => (
          <Chip
            key={d.value}
            label={d.label}
            selected={ob.longDay === d.value}
            onPress={() => ob.set({ longDay: d.value })}
          />
        ))}
      </View>

      <SectionLabel>Minutes per session</SectionLabel>
      <View className="flex-row flex-wrap">
        {MINUTES.map((m) => (
          <Chip
            key={m}
            label={`${m}`}
            selected={ob.minutesPerSession === m}
            onPress={() => ob.set({ minutesPerSession: m })}
          />
        ))}
      </View>

      <SectionLabel>Equipment</SectionLabel>
      <View className="flex-row flex-wrap">
        {EQUIPMENT.map((e) => (
          <Chip
            key={e.value}
            label={e.label}
            selected={ob.equipment.includes(e.value)}
            onPress={() => toggleEquipment(e.value)}
          />
        ))}
      </View>

      <SectionLabel>Strength sessions per week</SectionLabel>
      <View className="flex-row flex-wrap">
        {[0, 1, 2, 3].map((n) => (
          <Chip
            key={n}
            label={`${n}`}
            selected={ob.strengthPerWeek === n}
            onPress={() => ob.set({ strengthPerWeek: n })}
          />
        ))}
      </View>

      <Button
        label="Build my plan"
        onPress={() => router.push("/(onboarding)/generating")}
        disabled={!canContinue}
      />
    </Screen>
  );
}
