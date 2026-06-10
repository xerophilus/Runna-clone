/**
 * Session card (spec §5.3 "Today card" + week list rows): title, type icon,
 * estimated duration, single-line summary. Status renders as a colored dot.
 */

import { Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Session, SessionStatus, Units } from "../core/types/domain";
import {
  SESSION_ICON,
  formatDateShort,
  formatDuration,
  sessionSummary,
  sessionTitle,
} from "../lib/format";

export const STATUS_COLOR: Record<SessionStatus, string> = {
  scheduled: "#D6CFC6",
  completed: "#4D6A4F",
  skipped: "#B3402A",
  modified: "#C9A227",
};

export function StatusDot({ status, size = 8 }: { status: SessionStatus; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: STATUS_COLOR[status],
      }}
    />
  );
}

export function SessionCard({
  session,
  units,
  showDate = false,
  big = false,
}: {
  session: Session;
  units: Units;
  showDate?: boolean;
  big?: boolean;
}) {
  const router = useRouter();
  const p = session.prescription;
  const title = session.display?.title ?? sessionTitle(p);
  const isRest = p.type === "rest";

  return (
    <Pressable
      onPress={() => router.push(`/session/${session.id}`)}
      className={`bg-card rounded-2xl border border-line p-4 mb-3 active:opacity-80 ${
        big ? "py-5" : ""
      }`}
    >
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-accentSoft items-center justify-center mr-3">
          <Ionicons name={SESSION_ICON[p.type] as never} size={18} color="#C2572B" />
        </View>
        <View className="flex-1">
          <View className="flex-row items-center">
            <Text className={`font-semibold text-ink ${big ? "text-xl" : "text-base"}`}>
              {title}
            </Text>
            <View className="ml-2">
              <StatusDot status={session.status} />
            </View>
          </View>
          <Text className="text-sm text-slate mt-0.5" numberOfLines={1}>
            {sessionSummary(p, units)}
          </Text>
        </View>
        <View className="items-end ml-2">
          {showDate ? (
            <Text className="text-xs text-slate">{formatDateShort(session.scheduled_date)}</Text>
          ) : null}
          {!isRest ? (
            <Text className="text-xs text-slate mt-0.5">~{formatDuration(p.est_duration_s)}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}
