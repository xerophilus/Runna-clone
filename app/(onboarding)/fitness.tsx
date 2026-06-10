/**
 * Onboarding 3: current fitness (spec §5.1). Everything here is skippable —
 * the engine falls back to conservative defaults and recalibrates from the
 * first weeks of logged data.
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
import {
  parseClock,
  parseLoadToKg,
  parsePaceToSecPerKm,
  parseWeeklyDistanceToMeters,
} from "@/lib/parse";
import type { Units } from "@/core/types/domain";

const RACE_DISTANCES = [
  { label: "5K", m: 5000 },
  { label: "10K", m: 10000 },
  { label: "Half", m: 21097 },
  { label: "Marathon", m: 42195 },
];

export default function FitnessScreen() {
  const router = useRouter();
  const ob = useOnboardingStore();
  const [raceTime, setRaceTime] = useState("");
  const [raceDistM, setRaceDistM] = useState<number>(5000);
  const [easyPace, setEasyPace] = useState("");
  const [weekly, setWeekly] = useState("");
  const [squat, setSquat] = useState("");
  const [deadlift, setDeadlift] = useState("");
  const [error, setError] = useState<string | null>(null);

  const distUnit = ob.units === "imperial" ? "miles" : "km";
  const loadUnit = ob.units === "imperial" ? "lb" : "kg";

  const setUnits = (units: Units) => ob.set({ units });

  const next = () => {
    setError(null);

    const raceTimeS = raceTime.trim() ? parseClock(raceTime) : null;
    if (raceTime.trim() && raceTimeS === null) {
      setError("Race time should look like 24:30 or 1:45:00.");
      return;
    }
    const easy = easyPace.trim() ? parsePaceToSecPerKm(easyPace, ob.units) : null;
    if (easyPace.trim() && easy === null) {
      setError(`Easy pace should look like 9:30 (min/${ob.units === "imperial" ? "mi" : "km"}).`);
      return;
    }
    const weeklyM = weekly.trim() ? parseWeeklyDistanceToMeters(weekly, ob.units) : null;
    if (weekly.trim() && weeklyM === null) {
      setError(`Weekly volume should be a number of ${distUnit}.`);
      return;
    }

    ob.set({
      recentRaceDistanceM: raceTimeS ? raceDistM : null,
      recentRaceTimeS: raceTimeS,
      easyPaceSecPerKm: easy,
      weeklyRunM: weeklyM,
      lifts: {
        squat: squat.trim() ? (parseLoadToKg(squat, ob.units) ?? undefined) : undefined,
        deadlift: deadlift.trim() ? (parseLoadToKg(deadlift, ob.units) ?? undefined) : undefined,
      },
    });
    router.push("/(onboarding)/availability");
  };

  return (
    <Screen>
      <Title>Where are you now?</Title>
      <Subtitle>
        Everything here is optional. Skip what you don&apos;t know — the plan starts conservative
        and recalibrates from your first logged weeks.
      </Subtitle>

      <SectionLabel>Units</SectionLabel>
      <View className="flex-row">
        <Chip label="Miles / lb" selected={ob.units === "imperial"} onPress={() => setUnits("imperial")} />
        <Chip label="Km / kg" selected={ob.units === "metric"} onPress={() => setUnits("metric")} />
      </View>

      <SectionLabel>Recent race or time trial</SectionLabel>
      <View className="flex-row flex-wrap">
        {RACE_DISTANCES.map((d) => (
          <Chip
            key={d.m}
            label={d.label}
            selected={raceDistM === d.m}
            onPress={() => setRaceDistM(d.m)}
          />
        ))}
      </View>
      <Field
        label="Finish time"
        placeholder="24:30"
        autoCapitalize="none"
        value={raceTime}
        onChangeText={setRaceTime}
        hint="Your paces derive from this — the best single input you can give"
      />

      <Text className="text-sm text-slate mb-2">No recent race? An easy pace works too:</Text>
      <Field
        label={`Comfortable easy pace (min/${ob.units === "imperial" ? "mi" : "km"})`}
        placeholder={ob.units === "imperial" ? "9:30" : "5:55"}
        autoCapitalize="none"
        value={easyPace}
        onChangeText={setEasyPace}
      />

      <SectionLabel>Current running</SectionLabel>
      <Field
        label={`Weekly volume (${distUnit})`}
        placeholder={ob.units === "imperial" ? "20" : "32"}
        keyboardType="numeric"
        value={weekly}
        onChangeText={setWeekly}
      />

      <SectionLabel>Lifts (optional)</SectionLabel>
      <Field
        label={`Squat 1RM or heavy single (${loadUnit})`}
        placeholder={ob.units === "imperial" ? "225" : "100"}
        keyboardType="numeric"
        value={squat}
        onChangeText={setSquat}
      />
      <Field
        label={`Deadlift 1RM (${loadUnit})`}
        placeholder={ob.units === "imperial" ? "315" : "140"}
        keyboardType="numeric"
        value={deadlift}
        onChangeText={setDeadlift}
      />

      <ErrorText>{error}</ErrorText>
      <Button label="Continue" onPress={next} />
      <Button label="Skip — use conservative defaults" variant="ghost" onPress={() => router.push("/(onboarding)/availability")} />
    </Screen>
  );
}
