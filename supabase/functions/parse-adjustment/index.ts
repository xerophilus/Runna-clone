/**
 * Edge Function: natural-language adjustment parsing (spec §5.5 trigger 4, §7 task 2).
 *
 * Input:  { text, plan_context }  — free text like "move long runs to Sunday".
 * Output: a structured Adjustment object the rules engine understands, or a
 *         { adjustment: "clarify", question } when the request is ambiguous.
 *
 * The LLM emits structure only; the deterministic rules engine decides what the
 * structure does to the plan (spec §3). Anything unparseable becomes a clarify.
 */

import { anthropic, PARSE_MODEL, corsHeaders, responseText } from "../_shared/anthropic.ts";

const SYSTEM = `You translate a user's free-text request about their training plan into ONE structured adjustment.
Return ONLY a JSON object matching one of these shapes:
{"adjustment":"shift_long_run","to_day":"mon|tue|wed|thu|fri|sat|sun"}
{"adjustment":"increase_hill_volume","magnitude":"slight|moderate|large"}
{"adjustment":"reduce_volume","magnitude":"slight|moderate|large"}
{"adjustment":"ease_goal_pace","magnitude":"slight|moderate|large"}
{"adjustment":"travel_week","week_index":<int>=0>}
{"adjustment":"clarify","question":"<a short question>"}
Rules:
- No markdown, no prose, JSON only.
- If the request is ambiguous, out of scope, or you are unsure, return the clarify shape.`;

const MAGS = new Set(["slight", "moderate", "large"]);
const DAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

function validate(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  switch (o.adjustment) {
    case "shift_long_run":
      return typeof o.to_day === "string" && DAYS.has(o.to_day) ? o : null;
    case "increase_hill_volume":
    case "reduce_volume":
    case "ease_goal_pace":
      return typeof o.magnitude === "string" && MAGS.has(o.magnitude) ? o : null;
    case "travel_week":
      return typeof o.week_index === "number" && Number.isInteger(o.week_index) && o.week_index >= 0 ? o : null;
    case "clarify":
      return typeof o.question === "string" && o.question.trim().length > 0 ? o : null;
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json()) as { text?: string; plan_context?: unknown };
    if (!body?.text?.trim()) return json({ error: "missing text" }, 400);

    const userPrompt = JSON.stringify({ request: body.text, plan_context: body.plan_context ?? {} });

    let adjustment = await callModel(userPrompt);
    if (!adjustment) adjustment = await callModel(userPrompt + "\n\nReturn ONLY valid JSON.");

    // Unparseable after a retry → surface a clarify rather than guess (spec §7).
    return json(adjustment ?? { adjustment: "clarify", question: "Could you rephrase that? I want to make sure I change the right thing." }, 200);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});

async function callModel(userPrompt: string) {
  const message = await anthropic.messages.create({
    model: PARSE_MODEL,
    max_tokens: 256,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
  });
  try {
    return validate(JSON.parse(responseText(message)));
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
