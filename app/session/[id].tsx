/**
 * Expanded session (spec §5.3): warmup → main set → cooldown with concrete
 * range targets, strength as exercise → sets × reps @ load, coaching note at
 * the bottom. Logging (spec §5.4): complete/skip + effort flag + optional RPE —
 * the effort tap is the most important adaptation signal, so it's one screen,
 * no modal.
 */

import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, ErrorText, Screen, SectionLabel, Title } from "@/components/ui";
import { usePlanStore } from "@/stores/planStore";
import { useAuthStore, currentUserId } from "@/stores/authStore";
import {
  describeExercise,
  describeSegment,
  formatDateLong,
  formatDistance,
  formatDuration,
  formatLoadKg,
  formatPaceRange,
  sessionTitle,
} from "@/lib/format";
import type { EffortFlag } from "@/core/types/domain";
import type { Prescription } from "@/core/types/prescription";

const EFFORTS: { value: EffortFlag; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "ok", label: "OK" },
  { value: "hard", label: "Hard" },
  { value: "failed", label: "Couldn't finish" },
];

function PrescriptionBody({ p, units }: { p: Prescription; units: "metric" | "imperial" }) {
  switch (p.type) {
    case "run":
      return (
        <>
          {p.blocks.map((block, i) => (
            <Card key={i} className="mb-3">
              <Text className="text-xs uppercase tracking-widest text-slate mb-2">
                {block.label}
              </Text>
              {block.segments.map((seg, j) => (
                <Text key={j} className="text-base text-ink leading-6">
                  {describeSegment(seg, units)}
                </Text>
              ))}
            </Card>
          ))}
        </>
      );
    case "strength":
      return (
        <Card className="mb-3">
          {p.exercises.map((ex, i) => (
            <View key={i} className={i > 0 ? "mt-3 pt-3 border-t border-line" : ""}>
              <Text className="text-base font-medium text-ink">{ex.name}</Text>
              <Text className="text-sm text-slate mt-0.5">{describeExercise(ex, units)}</Text>
            </View>
          ))}
        </Card>
      );
    case "ruck":
      return (
        <Card className="mb-3">
          <Text className="text-base text-ink leading-6">
            {formatDistance(p.distance_m, units)} carrying {formatLoadKg(p.load_kg, units)}
          </Text>
          <Text className="text-sm text-slate mt-1">
            Target pace {formatPaceRange(p.target_pace.low, p.target_pace.high, units)}
          </Text>
        </Card>
      );
    case "cross":
      return (
        <Card className="mb-3">
          <Text className="text-base text-ink">
            {formatDuration(p.est_duration_s)} of {p.modality}, RPE {p.target.low}–{p.target.high}
          </Text>
        </Card>
      );
    case "rest":
      return (
        <Card className="mb-3">
          <Text className="text-base text-ink">
            {p.mode === "active" ? "Light mobility or an easy walk." : "Full rest. Let the work absorb."}
          </Text>
        </Card>
      );
  }
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const plan = usePlanStore((s) => s.plan);
  const units = usePlanStore((s) => s.units);
  const logSession = usePlanStore((s) => s.logSession);
  const demoMode = useAuthStore((s) => s.demoMode);

  const [effort, setEffort] = useState<EffortFlag | null>(null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = plan?.weeks.flatMap((w) => w.sessions).find((s) => s.id === id);
  if (!session) {
    return (
      <Screen>
        <Title>Session not found</Title>
      </Screen>
    );
  }

  const p = session.prescription;
  const isRest = p.type === "rest";
  const open = session.status === "scheduled";

  const log = async (status: "completed" | "skipped") => {
    setBusy(true);
    setError(null);
    try {
      await logSession({
        sessionId: session.id,
        status,
        effortFlag: status === "completed" ? effort : null,
        rpe: status === "completed" ? rpe : null,
        persist: !demoMode,
        userId: currentUserId(),
      });
      router.back();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>{session.display?.title ?? sessionTitle(p)}</Title>
      <Text className="text-base text-slate mb-1">{formatDateLong(session.scheduled_date)}</Text>
      {!isRest ? (
        <Text className="text-sm text-slate mb-4">~{formatDuration(p.est_duration_s)}</Text>
      ) : (
        <View className="mb-4" />
      )}

      {session.display?.instructions ? (
        <Text className="text-base text-ink leading-6 mb-4">{session.display.instructions}</Text>
      ) : null}

      <PrescriptionBody p={p} units={units} />

      <Card className="bg-accentSoft border-accentSoft">
        <Text className="text-sm text-ink leading-5">
          {session.display?.coaching_note ??
            (isRest
              ? "Recovery is where adaptation happens."
              : "Targets are ranges on purpose — anywhere inside them is a hit.")}
        </Text>
      </Card>

      {!isRest && open ? (
        <>
          <SectionLabel>How did it feel?</SectionLabel>
          <View className="flex-row flex-wrap">
            {EFFORTS.map((e) => (
              <Pressable
                key={e.value}
                onPress={() => setEffort(effort === e.value ? null : e.value)}
                className={`rounded-full border px-4 py-2 mr-2 mb-2 ${
                  effort === e.value ? "bg-ink border-ink" : "bg-card border-line"
                }`}
              >
                <Text className={effort === e.value ? "text-white font-medium" : "text-ink"}>
                  {e.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <SectionLabel>RPE (optional)</SectionLabel>
          <View className="flex-row flex-wrap">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Pressable
                key={n}
                onPress={() => setRpe(rpe === n ? null : n)}
                className={`w-9 h-9 rounded-full border mr-1.5 mb-2 items-center justify-center ${
                  rpe === n ? "bg-accent border-accent" : "bg-card border-line"
                }`}
              >
                <Text className={rpe === n ? "text-white font-medium" : "text-ink"}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <ErrorText>{error}</ErrorText>
          <Button label="Mark complete" onPress={() => void log("completed")} loading={busy} />
          <Button label="Skip this session" variant="ghost" onPress={() => void log("skipped")} />
        </>
      ) : null}

      {!open ? (
        <Text className="text-sm text-slate mt-4">
          Logged as {session.status}
          {session.effort_flag ? ` · felt ${session.effort_flag}` : ""}.
        </Text>
      ) : null}
    </Screen>
  );
}
