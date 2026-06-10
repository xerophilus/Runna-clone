/**
 * Telemetry seam (spec §3: Sentry + PostHog).
 *
 * Kept as a thin abstraction so screens never import a vendor SDK directly.
 * Wire-up: initialize PostHog/Sentry here when EXPO_PUBLIC_POSTHOG_KEY /
 * SENTRY_DSN are present; until then events log in dev and no-op in prod.
 *
 * Funnel events to watch (spec §3): onboarding completion, first plan
 * generated, week-1 adherence.
 */

export function track(event: string, properties?: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[telemetry] ${event}`, properties ?? "");
  }
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (__DEV__) {
    console.error("[telemetry:error]", error, context ?? "");
  }
}
