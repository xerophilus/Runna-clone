/**
 * Today (spec §5.3): the day's session front and center, the rest of the week
 * at a glance with status dots.
 */

import { Text, View } from "react-native";
import { Screen, SectionLabel, Title, Card } from "@/components/ui";
import { SessionCard, StatusDot } from "@/components/SessionCard";
import { usePlanStore } from "@/stores/planStore";
import { formatDateLong, localTodayISO } from "@/lib/format";
import type { Session, Week } from "@/core/types/domain";

/** The week whose date span contains today, else the next upcoming week. */
function weekContaining(weeks: Week[], dateISO: string): Week | undefined {
  const within = weeks.find((w) => {
    if (w.sessions.length === 0) return false;
    const first = w.sessions[0]!.scheduled_date;
    const last = w.sessions[w.sessions.length - 1]!.scheduled_date;
    return first <= dateISO && dateISO <= last;
  });
  return within ?? weeks.find((w) => w.sessions.some((s) => s.scheduled_date > dateISO));
}

export default function TodayScreen() {
  const plan = usePlanStore((s) => s.plan);
  const units = usePlanStore((s) => s.units);
  if (!plan) return null;

  const today = localTodayISO();
  const allSessions = plan.weeks.flatMap((w) => w.sessions);
  const todaySessions = allSessions.filter((s) => s.scheduled_date === today);
  const nextSession: Session | undefined = allSessions.find(
    (s) => s.scheduled_date > today && s.status === "scheduled",
  );
  const currentWeek = weekContaining(plan.weeks, today) ?? plan.weeks[0];

  return (
    <Screen>
      <Title>Today</Title>
      <Text className="text-base text-slate mb-4">{formatDateLong(today)}</Text>

      {todaySessions.length > 0 ? (
        todaySessions.map((s) => <SessionCard key={s.id} session={s} units={units} big />)
      ) : (
        <Card>
          <Text className="text-base text-ink font-medium">Nothing scheduled today.</Text>
          {nextSession ? (
            <Text className="text-sm text-slate mt-1">
              Next up: {formatDateLong(nextSession.scheduled_date)}.
            </Text>
          ) : null}
        </Card>
      )}

      {currentWeek ? (
        <>
          <SectionLabel>
            This week · {currentWeek.phase}
            {currentWeek.is_deload ? " · deload" : ""}
          </SectionLabel>
          <Card className="mb-3">
            <View className="flex-row justify-between">
              {currentWeek.sessions.map((s) => (
                <View key={s.id} className="items-center">
                  <Text className="text-xs text-slate mb-1.5">
                    {new Date(`${s.scheduled_date}T00:00:00`).toLocaleDateString(undefined, {
                      weekday: "narrow",
                    })}
                  </Text>
                  <StatusDot status={s.status} size={10} />
                </View>
              ))}
            </View>
          </Card>
          {currentWeek.sessions
            .filter((s) => s.scheduled_date !== today)
            .map((s) => (
              <SessionCard key={s.id} session={s} units={units} showDate />
            ))}
        </>
      ) : null}
    </Screen>
  );
}
