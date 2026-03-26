// @ts-nocheck
/**
 * OpenRouter Configuration
 *
 * API URL, key getter, and model constant for OpenRouter LLM calls.
 */

export const OPENROUTER_API_URL =
  "https://openrouter.ai/api/v1/chat/completions";

export const OPENROUTER_MODEL = "google/gemini-3-flash-preview";

// Thinking model for deep extraction tasks (post-call summary, transcript analysis).
// Gemini 3.1 Pro Preview — strongest reasoning model, mandatory thinking with
// configurable effort. 1M context. $2/M input, $12/M output.
export const OPENROUTER_EXTRACTION_MODEL = "google/gemini-3.1-pro-preview";

export function getOpenRouterApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }
  return key;
}
