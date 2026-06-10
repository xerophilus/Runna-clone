/**
 * Adaptation review screen (spec §5.5 "Transparency + consent").
 *
 * Shows the pending proposal: why it triggered, the honest summary, and the
 * concrete week-by-week volume diff. Nothing applies until the user accepts.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, Card, ErrorText, Screen, SectionLabel, Title } from "@/components/ui";
import { usePlanStore } from "@/stores/planStore";
import { useAdaptationStore } from "@/stores/adaptationStore";
import { useAuthStore } from "@/stores/authStore";
import { formatDistance } from "@/lib/format";

export default function AdaptationReview() {
  const router = useRouter();
  const { pending, dismiss, setPending } = useAdaptationStore();
  const applyProposal = usePlanStore((s) => s.applyProposal);
  const units = usePlanStore((s) => s.units);
  const demoMode = useAuthStore((s) => s.demoMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!pending) {
    return (
      <Screen>
        <Title>Nothing to review</Title>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const diff = pending.result.diff;
  const shown = diff.weeks_changed.slice(0, 8);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      await applyProposal(pending, !demoMode);
      setPending(null);
      router.back();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Proposed adjustment</Title>
      <Text className="text-base text-ink leading-6 mt-1 mb-4">{pending.summary}</Text>

      <Card className={diff.goal_date_changed ? "border-accent" : ""}>
        <Text className="text-sm text-slate">Goal date</Text>
        <Text className="text-base text-ink font-medium mt-0.5">
          {diff.goal_date_changed
            ? `${diff.goal_date_before} → ${diff.goal_date_after}`
            : `${diff.goal_date_after ?? "ongoing"} — unchanged`}
        </Text>
      </Card>

      {shown.length > 0 ? (
        <>
          <SectionLabel>Week-by-week run volume</SectionLabel>
          <Card>
            {shown.map((w) => (
              <View key={w.week_index} className="flex-row items-center justify-between mb-1.5">
                <Text className="text-sm text-slate">Week {w.week_index + 1}</Text>
                <Text className="text-sm text-ink">
                  {formatDistance(w.before.run_distance, units)} →{" "}
                  {formatDistance(w.after.run_distance, units)}
                </Text>
              </View>
            ))}
            {diff.weeks_changed.length > shown.length ? (
              <Text className="text-xs text-slate mt-1">
                …and {diff.weeks_changed.length - shown.length} more weeks adjust similarly.
              </Text>
            ) : null}
          </Card>
        </>
      ) : null}

      <ErrorText>{error}</ErrorText>
      <Button label="Apply this change" onPress={() => void accept()} loading={busy} />
      <Button
        label="Keep my plan as is"
        variant="ghost"
        onPress={() => {
          dismiss(pending.trigger);
          router.back();
        }}
      />
    </Screen>
  );
}
