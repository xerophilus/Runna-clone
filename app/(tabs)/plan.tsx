/**
 * Plan view (spec §5.3): phases as a timeline, weekly volume bars, current
 * week highlighted, goal date pinned at the end.
 */

import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Button, Card, Screen, SectionLabel, Title } from "@/components/ui";
import { SessionCard } from "@/components/SessionCard";
import { usePlanStore } from "@/stores/planStore";
import { useAuthStore } from "@/stores/authStore";
import { useAdaptation } from "@/lib/useAdaptation";
import {
  adjustmentToProposalArgs,
  parseLocally,
  parseViaEdge,
} from "@/lib/adaptationService";
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
  const demoMode = useAuthStore((s) => s.demoMode);
  const { proposeAndReview, busy } = useAdaptation();
  const today = localTodayISO();
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [coachReply, setCoachReply] = useState<string | null>(null);

  if (!plan) return null;

  /** "Talk to your plan" (spec §5.5 trigger 4): parse → structured → reflow. */
  const submitRequest = async () => {
    const text = request.trim();
    if (!text) return;
    setCoachReply(null);

    // Edge Function when signed in; deterministic keyword fallback in demo
    // mode or when the function is unreachable (spec §7 guardrails).
    const adjustment = demoMode
      ? parseLocally(text)
      : ((await parseViaEdge(text, plan)) ?? parseLocally(text));

    const args = adjustmentToProposalArgs(adjustment);
    if ("clarify" in args) {
      setCoachReply(args.clarify);
      return;
    }
    if (args.unsupported) {
      setCoachReply(args.unsupported);
      return;
    }
    setRequest("");
    await proposeAndReview("user_request", {
      adjustments: args.adjustments,
      longDay: args.longDay,
    }).catch((err) => setCoachReply(String(err)));
  };

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

      <SectionLabel>Talk to your plan</SectionLabel>
      <Card>
        <TextInput
          className="bg-paper border border-line rounded-xl px-4 py-3 text-base text-ink"
          placeholder='e.g. "move my long run to Saturday"'
          placeholderTextColor="#A8A29E"
          value={request}
          onChangeText={setRequest}
          onSubmitEditing={() => void submitRequest()}
          returnKeyType="send"
        />
        {coachReply ? (
          <Text className="text-sm text-ink mt-3 leading-5">{coachReply}</Text>
        ) : null}
        <Button
          label="Ask"
          variant="secondary"
          onPress={() => void submitRequest()}
          disabled={!request.trim()}
          loading={busy}
        />
      </Card>

      <Card className="mt-3">
        <Text className="text-base font-medium text-ink">Feeling beat up?</Text>
        <Text className="text-sm text-slate mt-1 leading-5">
          The next block can back off without giving up your goal date. You&apos;ll see exactly
          what changes before anything applies.
        </Text>
        <Button
          label="Dial it back"
          variant="secondary"
          loading={busy}
          onPress={() => void proposeAndReview("manual_fatigue").catch(() => {})}
        />
      </Card>
    </Screen>
  );
}
