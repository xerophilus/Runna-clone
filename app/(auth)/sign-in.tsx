/**
 * Sign in / sign up (Build Sequence step 1). One screen with a mode toggle.
 * When Supabase isn't configured, demo mode keeps the product explorable.
 */

import { useState } from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Button, ErrorText, Field, Screen, Subtitle, Title } from "@/components/ui";
import { useAuthStore } from "@/stores/authStore";
import { isSupabaseConfigured } from "@/lib/supabase";

export default function SignIn() {
  const router = useRouter();
  const { signIn, signUp, enterDemoMode, error } = useAuthStore();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setNotice(null);
    try {
      if (mode === "sign_in") {
        const ok = await signIn(email.trim(), password);
        if (ok) router.replace("/");
      } else {
        const result = await signUp(email.trim(), password);
        if (result === "session") router.replace("/");
        if (result === "confirm_email") {
          setNotice("Check your email to confirm your account, then sign in.");
          setMode("sign_in");
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Title>Cadence</Title>
      <Subtitle>
        Adaptive training for runners and hybrid athletes. A plan that bends when life does.
      </Subtitle>

      {isSupabaseConfigured ? (
        <>
          <Field
            label="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
          />
          <ErrorText>{error}</ErrorText>
          {notice ? <Text className="text-sm text-moss mt-2">{notice}</Text> : null}
          <Button
            label={mode === "sign_in" ? "Sign in" : "Create account"}
            onPress={() => void submit()}
            loading={busy}
            disabled={!email.trim() || password.length < 6}
          />
          <Button
            label={mode === "sign_in" ? "New here? Create an account" : "Have an account? Sign in"}
            variant="ghost"
            onPress={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}
          />
          <View className="h-px bg-line my-4" />
        </>
      ) : (
        <Text className="text-sm text-slate mb-2">
          No Supabase project is configured (EXPO_PUBLIC_SUPABASE_URL is unset), so accounts are
          unavailable. You can still explore the full product in demo mode — plans generate
          locally and aren&apos;t saved.
        </Text>
      )}

      <Button
        label="Try the demo"
        variant="secondary"
        onPress={() => {
          enterDemoMode();
          router.replace("/(onboarding)/goal");
        }}
      />
    </Screen>
  );
}
