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

This is the **load-bearing core** the rest of the product builds on — Build
Sequence steps 1–3 plus the testable slices of 5, 8, and 9 (spec §8). It is fully
typed, deterministic, and unit-tested; there is no UI shell yet (see Status below).

```
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
npm test          # 72 unit tests across the engine, contracts, and matching
npm run typecheck # strict TypeScript, no errors
npm run demo      # generate + print a 16-week marathon plan
```

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
| 1 | Project scaffold + Auth | DB schema + RLS done; Expo/Auth shell pending |
| 2 | Onboarding flow | domain types + inputs modeled; UI pending |
| 3 | **Rules engine (static plans)** | **done, unit-tested** |
| 4 | Workout display | renders from prescriptions; UI pending |
| 5 | LLM session copywriting | Edge Function + guardrails done; client wiring pending |
| 6 | Manual logging | domain modeled; UI pending |
| 7 | HealthKit sync | matching logic done, unit-tested; native bridge pending |
| 8 | **Adaptive re-planning** | **engine + diff + consent done, unit-tested** |
| 9 | NL adjustment parsing | Edge Function + contract done |
| 10 | Dashboard | pending |

The next slice is the Expo/React Native app shell (Build Sequence step 1): auth,
onboarding screens persisting to Supabase, and rendering the generated plan from
the engine that already exists here.

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
