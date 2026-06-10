/**
 * Onboarding 1–2: goal type + detail (spec §5.1).
 * Soft feasibility validation happens at generation, never blocking here.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  Button,
  Chip,
  ErrorText,
  Field,
  Screen,
  SectionLabel,
  Subtitle,
  Title,
} from "@/components/ui";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { parseClock, parseISODateInput } from "@/lib/parse";
import type { GoalType, MaintenanceEmphasis } from "@/core/types/domain";

const RACE_DISTANCES = [
  { label: "5K", m: 5000 },
  { label: "10K", m: 10000 },
  { label: "Half", m: 21097 },
  { label: "Marathon", m: 42195 },
];

const GOAL_TYPES: { label: string; value: GoalType; blurb: string }[] = [
  { label: "Race", value: "race", blurb: "Train toward a race day" },
  { label: "Standard", value: "standard", blurb: "Hit a fitness test standard" },
  { label: "Maintain", value: "maintenance", blurb: "Stay fit, no end date" },
];

const EMPHASES: { label: string; value: MaintenanceEmphasis }[] = [
  { label: "Run-lean", value: "run_lean" },
  { label: "Balanced", value: "balanced" },
  { label: "Strength-lean", value: "strength_lean" },
];

export default function GoalScreen() {
  const router = useRouter();
  const ob = useOnboardingStore();
  const [dateText, setDateText] = useState(ob.raceDateISO ?? "");
  const [timeText, setTimeText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const next = () => {
    setError(null);
    if (ob.goalType !== "maintenance") {
      const iso = parseISODateInput(dateText);
      if (!iso) {
        setError("Enter the goal date as YYYY-MM-DD.");
        return;
      }
      const target = timeText.trim() ? parseClock(timeText) : null;
      if (timeText.trim() && target === null) {
        setError("Target time should look like 45:30 or 3:25:00 (or leave it blank).");
        return;
      }
      ob.set({ raceDateISO: iso, raceTargetTimeS: target });
    }
    router.push("/(onboarding)/fitness");
  };

  return (
    <Screen>
      <Title>What are you training for?</Title>
      <Subtitle>This shapes the whole plan — phases, volume, and taper.</Subtitle>

      <SectionLabel>Goal</SectionLabel>
      <View className="flex-row flex-wrap">
        {GOAL_TYPES.map((g) => (
          <Chip
            key={g.value}
            label={g.label}
            selected={ob.goalType === g.value}
            onPress={() => ob.set({ goalType: g.value })}
          />
        ))}
      </View>
      <Text className="text-sm text-slate mb-2">
        {GOAL_TYPES.find((g) => g.value === ob.goalType)?.blurb}
      </Text>

      {ob.goalType === "race" ? (
        <>
          <SectionLabel>Distance</SectionLabel>
          <View className="flex-row flex-wrap">
            {RACE_DISTANCES.map((d) => (
              <Chip
                key={d.m}
                label={d.label}
                selected={ob.raceDistanceM === d.m}
                onPress={() => ob.set({ raceDistanceM: d.m })}
              />
            ))}
          </View>
        </>
      ) : null}

      {ob.goalType === "standard" ? (
        <>
          <SectionLabel>Standard</SectionLabel>
          <View className="flex-row flex-wrap">
            <Chip
              label="Navy PRT"
              selected={ob.standardName === "navy_prt"}
              onPress={() => ob.set({ standardName: "navy_prt" })}
            />
            <Chip
              label="Army ACFT"
              selected={ob.standardName === "army_acft"}
              onPress={() => ob.set({ standardName: "army_acft" })}
            />
          </View>
        </>
      ) : null}

      {ob.goalType === "maintenance" ? (
        <>
          <SectionLabel>Emphasis</SectionLabel>
          <View className="flex-row flex-wrap">
            {EMPHASES.map((e) => (
              <Chip
                key={e.value}
                label={e.label}
                selected={ob.maintenanceEmphasis === e.value}
                onPress={() => ob.set({ maintenanceEmphasis: e.value })}
              />
            ))}
          </View>
        </>
      ) : (
        <>
          <SectionLabel>When</SectionLabel>
          <Field
            label="Goal date"
            placeholder="2026-10-18"
            autoCapitalize="none"
            value={dateText}
            onChangeText={setDateText}
            hint="YYYY-MM-DD"
          />
          {ob.goalType === "race" ? (
            <Field
              label="Target time (optional)"
              placeholder="1:45:00"
              autoCapitalize="none"
              value={timeText}
              onChangeText={setTimeText}
              hint="Leave blank for a finish-focused plan"
            />
          ) : null}
        </>
      )}

      <ErrorText>{error}</ErrorText>
      <Button label="Continue" onPress={next} />
    </Screen>
  );
}
