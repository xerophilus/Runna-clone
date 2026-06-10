/**
 * Shared Anthropic client + model config for Edge Functions (spec §7).
 *
 * The model is called ONLY here, server-side. The client never holds the key.
 * `ANTHROPIC_API_KEY` is injected as an Edge Function secret.
 */

import Anthropic from "npm:@anthropic-ai/sdk@^0.40.0";

export const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "",
});

/**
 * Default to the most capable model. Session copywriting is a cheap, batched,
 * cache-backed task (spec §7 "cost control"), so operators who want to trim
 * cost can switch COPY_MODEL to "claude-haiku-4-5" via env without code change.
 */
export const COPY_MODEL = Deno.env.get("CADENCE_COPY_MODEL") ?? "claude-opus-4-8";
export const PARSE_MODEL = Deno.env.get("CADENCE_PARSE_MODEL") ?? "claude-opus-4-8";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Extract the concatenated text of a Messages API response. */
export function responseText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
