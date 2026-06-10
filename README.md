# Cadence — Adaptive Endurance & Hybrid Training App

An adaptive training-plan engine for endurance and hybrid athletes. A user states
a goal (a race, a fitness standard, or maintenance), provides fitness + availability,
and receives a structured, periodized plan that **reflows intelligently** when life
intervenes — missed sessions get absorbed, underperformance triggers recalibration,
a fatigue signal softens the block without abandoning the goal date.

The central architectural bet (spec §3): **the periodization is deterministic; the
LLM never does the math.** A unit-tested TypeScript rules engine owns everything
load-bearing (phases, volume progression, deloads, taper, pace/load derivation).
The LLM only turns structured prescriptions into readable copy and parses
natural-language plan-adjustment requests into structured parameters. The model
proposes; the rules engine disposes.

## What's in this repository

An Expo (SDK 56) / React Native app over a deterministic, unit-tested
periodization engine. The engine came first (it's the make-or-break, spec §10);
the app shell — auth, onboarding, plan display, manual logging — renders and
drives it.

```
app/                    # expo-router routes
  (auth)/sign-in        # email/password auth + zero-setup demo mode
  (onboarding)/         # goal → fitness → availability → generate (spec §5.1)
  (tabs)/               # Today / Plan / Progress (spec §5.3, §5.6)
  session/[id]          # expanded session + manual logging (spec §5.3–5.4)
src/lib/                # supabase client, formatting (units-aware), persistence repo
src/stores/             # zustand: auth, onboarding, plan
src/components/         # UI primitives + session cards
src/core/
  types/
    prescription.ts     # The Session Prescription Schema (spec §6) — discriminated union
    domain.ts           # Goal / Plan / Week / Session / Activity / Adaptation (spec §4)
  engine/               # The deterministic rules engine (spec §5.2) — no LLM, unit-tested
    config.ts           # All tunables (ramp %, deload cadence, phase splits, anchors, thresholds)
    vdot.ts             # Daniels–Gilbert VDOT + pace derivation
    phases.ts           # base/build/peak/taper allocation with minimums + distance-scaled taper
    volume.ts           # capped weekly ramp + deload placement + taper shedding
    scheduling.ts       # day distribution: long run on long day, no back-to-back hard days
    prescriptions.ts    # builders → structured Prescription objects
    generatePlan.ts     # orchestrator: goal + baseline + availability → Plan
    adaptation.ts       # trigger detection + reflow + diff + consent (spec §5.5, the wedge)
  llm/
    contracts.ts        # schema validation, number-drift guard, deterministic fallbacks (spec §7)
  matching/
    matchActivity.ts    # HealthKit activity → session matching (spec §5.4)
supabase/
  migrations/0001_initial_schema.sql   # Postgres schema + RLS (spec §4)
  functions/session-copy/              # Edge Function: prescription → display copy (spec §7 task 1)
  functions/parse-adjustment/          # Edge Function: free text → structured adjustment (spec §7 task 2)
scripts/demo.ts         # prints a generated marathon plan to eyeball periodization
```

## Quick start

```bash
npm install
npm start         # Expo dev server — press i / a / w for iOS / Android / web
npm test          # 72 unit tests across the engine, contracts, and matching
npm run typecheck # strict TypeScript, no errors
npm run demo      # generate + print a 16-week marathon plan in the terminal
```

No Supabase project configured? The app still works: **demo mode** generates
plans locally with the same engine, skipping persistence — the whole product is
explorable with zero setup. To run for real, copy `.env.example` to `.env`, fill
in `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, apply
`supabase/migrations/0001_initial_schema.sql`, and set `ANTHROPIC_API_KEY` as an
Edge Function secret.

`npm run demo` output (abridged) shows the engine producing a coherent, periodized
block — capped ~10%/week ramps, a deload every 4th week, a distance-scaled taper,
hard/easy spacing, and VDOT-derived pace ranges:

```
=== PHASE STRUCTURE ===
  base(6) → build(5) → peak(2) → taper(3)
=== WEEKLY VOLUME PROGRESSION ===
  W 0 base   45.0km ...
  W 3 base   38.1km ... [deload]
  ...
  W12 peak   81.4km ...
  W15 taper  47.7km ...
```

## Design decisions worth knowing

- **Rules engine vs. LLM (spec §3).** Pure-TypeScript, server-side, deterministic.
  `ENGINE_VERSION` lets two plan versions be diffed during adaptation. Idempotent:
  same inputs → identical plan.
- **Tunables are config, not magic numbers (spec §10).** The "~10%/week, deload
  every 4th week" heuristics and all adaptation thresholds live in `config.ts` and
  are mirrored into an `engine_config` table so they can be tuned server-side
  without an app release.
- **Adaptation reflows the future, never the past (spec §5.5).** Completed weeks are
  immutable; the engine re-runs over the remaining runway with adjusted inputs,
  diffs old vs. new, and flags `requires_consent` when the goal date or weekly
  volume moves beyond a threshold.
- **The engine owns the numbers (spec §7).** Every LLM output is schema-validated
  and post-checked for number drift; on failure it falls back to a deterministic
  template (copy) or a clarifying question (parsing).
- **VDOT paces are intentionally conservative** at cold start and meant to be
  recalibrated after ~2 weeks of logged data (spec §10).

## Status vs. the build sequence (spec §8)

| # | Step | State |
|---|------|-------|
| 1 | Project scaffold + Auth | **done** — Expo app, Supabase auth, demo mode; telemetry is a seam (`src/lib/telemetry.ts`) awaiting Sentry/PostHog keys |
| 2 | Onboarding flow | **done** — goal → fitness → availability → generate, persists `users`/`goals`, soft feasibility warning |
| 3 | **Rules engine (static plans)** | **done, unit-tested** |
| 4 | Workout display | **done** — today card, expanded session, week dots, phase/volume plan timeline |
| 5 | LLM session copywriting | **done** — Edge Function + client hydration with the number-drift guard re-run client-side; deterministic fallback when unreachable |
| 6 | Manual logging | **done** — complete/skip + effort flag + RPE, optimistic update + rollback |
| 7 | HealthKit sync | matching logic done, unit-tested; native bridge pending |
| 8 | **Adaptive re-planning** | **done end-to-end** — trigger detection on load (banner), manual "dial it back", proposal → consent review screen showing the week-by-week diff, persistence as a superseded/new plan version + adaptation row |
| 9 | NL adjustment parsing | **done** — "talk to your plan" input on the Plan tab; Edge Function parse with a narrow keyword fallback (demo mode), clarify-don't-guess |
| 10 | Dashboard | basic version done — adherence, streak, weekly done-vs-plan volume, readiness |

Verified: `tsc` clean, 87 tests green, and `expo export` bundles for both web
and iOS (Hermes). The remaining gap to the MVP ship line (spec §8, after step 8)
is the HealthKit native bridge — the matching logic it feeds is already built
and tested.

Worth knowing about the adaptation wiring: reflows never touch elapsed weeks
*or the elapsed part of the current week* — once a week is underway, changes
apply from next Monday (`reflowFromIndex`). Plans generated mid-week drop the
already-past days of week 0 so they don't instantly read as "missed"
(`dropPreStartSessions`).

## Open product decisions (spec §10, "Decisions to make before step 3")

These are wired as parameters so they don't block the engine, but they're product
calls the engine defers to its caller:

1. **Hybrid scope in MVP** — strength/ruck are first-class in the schema and engine
   (`hybrid` input to `generatePlan`); whether v1 ships run-only is a config/timeline
   call, not a code change.
2. **Standard presets** — `goals.detail` carries an opaque thresholds map; which
   standards (PRT brackets, etc.) ship first and where the data comes from is TBD.
3. **Adaptation aggressiveness** — defaults are deliberately conservative; a
   user-facing sensitivity setting can scale `config.adaptation.*`.
