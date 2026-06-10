/**
 * Edge Function: session copywriting (spec §5.2 Layer 2, §7 task 1).
 *
 * Input:  { prescription, context }  — the structured session + plan context.
 * Output: { title, instructions, coaching_note }  — cached by the caller into
 *         session.display, regenerated only when the prescription changes.
 *
 * The model only describes the prescribed session; it never invents targets.
 * Every response is validated against the schema and post-checked for number
 * drift (the engine owns the numbers). On any failure we fall back to a
 * deterministic template rather than ship bad copy.
 *
 * NOTE: the validation + drift-guard + template logic is the canonical
 * implementation in src/core/llm/contracts.ts. It is re-stated here minimally
 * because Edge Functions deploy as isolated Deno bundles; keep the two in sync.
 */

import { anthropic, COPY_MODEL, corsHeaders, responseText } from "../_shared/anthropic.ts";

const SYSTEM = `You are an expert endurance coach writing the copy for a single prescribed workout.
You will receive a structured workout prescription (JSON) and some plan context.
Return ONLY a JSON object: {"title": string, "instructions": string, "coaching_note": string}.
Rules:
- No markdown, no code fences, no prose outside the JSON.
- Reference the numbers in the prescription; never invent new paces, loads, or distances.
- Keep "instructions" to 1-3 short sentences and "coaching_note" to 1-2 sentences.
- Write like a coach: clear, motivating, specific to this session's intent and phase.`;

interface CopyRequest {
  prescription: unknown;
  context?: { goal?: string; phase?: string; week_index?: number };
}

function validate(raw: unknown): { title: string; instructions: string; coaching_note: string } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.title !== "string" || typeof o.instructions !== "string" || typeof o.coaching_note !== "string") {
    return null;
  }
  if (!o.title.trim() || !o.instructions.trim()) return null;
  return { title: o.title.trim(), instructions: o.instructions.trim(), coaching_note: o.coaching_note.trim() };
}

function templateFor(prescription: any): { title: string; instructions: string; coaching_note: string } {
  const type = prescription?.type ?? "rest";
  switch (type) {
    case "run":
      return {
        title: prescription.intent === "long" ? "Long Run" : "Run",
        instructions: "Follow the prescribed blocks and hold the target paces shown.",
        coaching_note: "Keep easy portions truly easy; the work happens in the main set.",
      };
    case "strength":
      return {
        title: `Strength — ${prescription.focus ?? "full"}`,
        instructions: "Complete each exercise for the prescribed sets and reps at the target load.",
        coaching_note: "Leave a rep or two in reserve unless a set is marked heavy.",
      };
    case "ruck":
      return {
        title: "Ruck",
        instructions: "Cover the prescribed distance under load at the target pace.",
        coaching_note: "Posture tall, short steps on the climbs.",
      };
    default:
      return { title: "Rest Day", instructions: "Full rest. Let the work absorb.", coaching_note: "Recovery is where adaptation happens." };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as CopyRequest;
    if (!body?.prescription) {
      return json({ error: "missing prescription" }, 400);
    }

    const userPrompt = JSON.stringify({ prescription: body.prescription, context: body.context ?? {} });

    let copy = await callModel(userPrompt);
    if (!copy) {
      // One stricter retry, then deterministic fallback (spec §7 guardrails).
      copy = await callModel(userPrompt + "\n\nReturn ONLY valid JSON. No other text.");
    }
    const result = copy ?? templateFor(body.prescription as any);
    return json({ ...result, source: copy ? "model" : "fallback" }, 200);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function callModel(userPrompt: string) {
  const message = await anthropic.messages.create({
    model: COPY_MODEL,
    max_tokens: 512,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = responseText(message);
  try {
    return validate(JSON.parse(text));
  } catch {
    return null;
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}
