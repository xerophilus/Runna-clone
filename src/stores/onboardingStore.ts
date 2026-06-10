/**
 * Onboarding state (spec §5.1). Accumulates the goal + fitness + availability
 * inputs across the four screens; `generating` consumes it.
 *
 * Every fitness input is optional — the engine has conservative defaults and
 * plan generation must never block on missing data.
 */

import { create } from "zustand";
import type {
  Equipment,
  GoalType,
  LiftMaxes,
  MaintenanceEmphasis,
  Units,
  Weekday,
} from "../core/types/domain";

export interface OnboardingState {
  units: Units;

  // Goal
  goalType: GoalType;
  raceDistanceM: number;
  raceDateISO: string | null;
  raceTargetTimeS: number | null;
  standardName: string;
  maintenanceEmphasis: MaintenanceEmphasis;

  // Fitness (all optional)
  recentRaceDistanceM: number | null;
  recentRaceTimeS: number | null;
  easyPaceSecPerKm: number | null;
  weeklyRunM: number | null;
  lifts: LiftMaxes;

  // Availability
  dayPrefs: Weekday[];
  longDay: Weekday;
  minutesPerSession: number;
  equipment: Equipment[];
  strengthPerWeek: number;

  set: (patch: Partial<OnboardingState>) => void;
  reset: () => void;
}

const initial = {
  units: "imperial" as Units,
  goalType: "race" as GoalType,
  raceDistanceM: 21097,
  raceDateISO: null,
  raceTargetTimeS: null,
  standardName: "navy_prt",
  maintenanceEmphasis: "balanced" as MaintenanceEmphasis,
  recentRaceDistanceM: null,
  recentRaceTimeS: null,
  easyPaceSecPerKm: null,
  weeklyRunM: null,
  lifts: {},
  dayPrefs: ["mon", "tue", "thu", "fri", "sun"] as Weekday[],
  longDay: "sun" as Weekday,
  minutesPerSession: 60,
  equipment: ["none"] as Equipment[],
  strengthPerWeek: 2,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...initial,
  set: (patch) => set(patch),
  reset: () => set(initial),
}));
