/**
 * Onboarding 5: generate (spec §5.1). Assembles the engine input from the
 * onboarding store, soft-checks feasibility (non-blocking, spec §5.1), runs
 * the deterministic engine, persists when signed in, then lands on Today.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Screen, Title } from "@/components/ui";
import { useOnboardingStore } from "@/stores/onboardingStore";
import { useAuthStore, currentUserId } from "@/stores/authStore";
import { usePlanStore } from "@/stores/planStore";
import { vdotFromRace, vdotFromEasyPace } from "@/core/engine/vdot";
import { DEFAULT_CONFIG } from "@/core/engine/config";
import { localTodayISO } from "@/lib/format";
import { track } from "@/lib/telemetry";
import type { GeneratePlanInput } from "@/core/engine/generatePlan";

type Stage = "feasibility" | "working" | "error";

function weeksUntil(iso: string): number {
  const ms = new Date(iso).getTime() - new Date(localTodayISO()).getTime();
  return Math.floor(ms / (7 * 86_400_000));
}

export default function GeneratingScreen() {
  const router = useRouter();
  const ob = useOnboardingStore();
  const demoMode = useAuthStore((s) => s.demoMode);
  const generateForUser = usePlanStore((s) => s.generateForUser);
  const [stage, setStage] = useState<Stage>("working");
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const buildAndRun = useCallback(async () => {
    setStage("working");
    setError(null);
    try {
      const vdot =
        ob.recentRaceTimeS && ob.recentRaceDistanceM
          ? vdotFromRace(ob.recentRaceDistanceM, ob.recentRaceTimeS)
          : ob.easyPaceSecPerKm
            ? vdotFromEasyPace(ob.easyPaceSecPerKm, DEFAULT_CONFIG)
            : undefined;

      const goal: Omit<GeneratePlanInput["goal"], "id" | "status"> & { status: "active" } =
        ob.goalType === "race"
          ? {
              type: "race",
              detail: {
                distance: ob.raceDistanceM,
                ...(ob.raceTargetTimeS ? { target_time: ob.raceTargetTimeS } : {}),
              },
              goal_date: ob.raceDateISO,
              status: "active",
            }
          : ob.goalType === "standard"
            ? {
                type: "standard",
                detail: { name: ob.standardName, thresholds: {} },
                goal_date: ob.raceDateISO,
                status: "active",
              }
            : {
                type: "maintenance",
                detail: { emphasis: ob.maintenanceEmphasis },
                goal_date: null,
                status: "active",
              };

      const includeRuck = ob.equipment.includes("rucksack");
      await generateForUser({
        userId: currentUserId(),
        persist: !demoMode,
        goal,
        baseline: {
          ...(vdot !== undefined ? { vdot } : {}),
          ...(ob.weeklyRunM !== null ? { current_weekly_run_m: ob.weeklyRunM } : {}),
          lifts: ob.lifts,
        },
        availability: {
          days_per_week: ob.dayPrefs.length,
          day_prefs: ob.dayPrefs,
          long_day: ob.longDay,
          minutes_per_session: ob.minutesPerSession,
          equipment: ob.equipment,
        },
        hybrid: {
          includeStrength: ob.strengthPerWeek > 0,
          strengthPerWeek: ob.strengthPerWeek,
          includeRuck,
          ruckPerWeek: includeRuck ? 1 : 0,
        },
        units: ob.units,
      });
      track("onboarding_completed");
      router.replace("/(tabs)");
    } catch (err) {
      setError(String(err));
      setStage("error");
    }
  }, [ob, demoMode, generateForUser, router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    // Soft feasibility check (spec §5.1): warn, never block.
    if (ob.goalType === "race" && ob.raceDateISO) {
      const weeks = weeksUntil(ob.raceDateISO);
      const marathonish = ob.raceDistanceM >= 21097;
      if (weeks < (marathonish ? 8 : 4)) {
        setWarning(
          `Your goal is ${Math.max(weeks, 0)} week${weeks === 1 ? "" : "s"} away — a short runway for this distance. We can still build a finish-focused plan that makes the most of the time you have.`,
        );
        setStage("feasibility");
        return;
      }
    }
    void buildAndRun();
  }, [ob, buildAndRun]);

  if (stage === "feasibility") {
    return (
      <Screen>
        <Title>That&apos;s a tight timeline</Title>
        <Text className="text-base text-slate mt-2 mb-4">{warning}</Text>
        <Button label="Train toward it anyway" onPress={() => void buildAndRun()} />
        <Button label="Pick a different date" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (stage === "error") {
    return (
      <Screen>
        <Title>Something went wrong</Title>
        <Text className="text-sm text-red-700 mt-2 mb-4">{error}</Text>
        <Button label="Try again" onPress={() => void buildAndRun()} />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <View className="flex-1 items-center justify-center bg-paper px-8">
      <ActivityIndicator size="large" color="#C2572B" />
      <Text className="font-serif text-2xl text-ink mt-6 text-center">Building your plan</Text>
      <Text className="text-base text-slate mt-2 text-center">
        Laying out phases, spacing the hard days, and deriving your paces…
      </Text>
    </View>
  );
}
