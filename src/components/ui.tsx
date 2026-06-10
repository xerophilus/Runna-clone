/**
 * Small shared UI primitives. Warm editorial palette from tailwind.config.js;
 * everything else composes these.
 */

import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children, scroll = true }: PropsWithChildren<{ scroll?: boolean }>) {
  return (
    <SafeAreaView className="flex-1 bg-paper">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-12 pt-2"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View className="flex-1 px-5 pt-2">{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ children }: PropsWithChildren) {
  return <Text className="font-serif text-3xl text-ink mt-4 mb-1">{children}</Text>;
}

export function Subtitle({ children }: PropsWithChildren) {
  return <Text className="text-base text-slate mb-5">{children}</Text>;
}

export function SectionLabel({ children }: PropsWithChildren) {
  return (
    <Text className="text-xs uppercase tracking-widest text-slate mt-6 mb-2">{children}</Text>
  );
}

export function Card({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <View className={`bg-card rounded-2xl border border-line p-4 ${className ?? ""}`}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
}) {
  const base = "rounded-full px-6 py-4 items-center justify-center mt-3";
  const styles =
    variant === "primary"
      ? "bg-accent active:opacity-90"
      : variant === "secondary"
        ? "bg-accentSoft active:opacity-80"
        : "bg-transparent";
  const textStyles =
    variant === "primary" ? "text-white font-semibold text-base" : "text-accent font-semibold text-base";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`${base} ${styles} ${disabled ? "opacity-40" : ""}`}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#fff" : "#C2572B"} />
      ) : (
        <Text className={textStyles}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full border px-4 py-2 mr-2 mb-2 ${
        selected ? "bg-ink border-ink" : "bg-card border-line"
      }`}
    >
      <Text className={selected ? "text-white font-medium" : "text-ink"}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...inputProps
}: { label: string; hint?: string } & TextInputProps) {
  return (
    <View className="mb-4">
      <Text className="text-sm font-medium text-ink mb-1.5">{label}</Text>
      <TextInput
        className="bg-card border border-line rounded-xl px-4 py-3 text-base text-ink"
        placeholderTextColor="#A8A29E"
        {...inputProps}
      />
      {hint ? <Text className="text-xs text-slate mt-1">{hint}</Text> : null}
    </View>
  );
}

export function ErrorText({ children }: PropsWithChildren) {
  if (!children) return null;
  return <Text className="text-sm text-red-700 mt-2">{children}</Text>;
}
