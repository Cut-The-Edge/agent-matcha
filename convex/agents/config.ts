// @ts-nocheck
/**
 * Agent Configuration
 *
 * Centralized configuration for the Agent Matcha AI system.
 * Controls which LLM to use, temperature settings per use case,
 * and feature flags to toggle between template-only and AI-enhanced modes.
 */

// ============================================================================
// Model Configuration
// ============================================================================

/**
 * Which LLM provider/model to use.
 * Set the AGENT_MODEL env var to switch between models:
 *   - "gpt-4o" (default) — OpenAI GPT-4o
 *   - "gpt-4o-mini" — OpenAI GPT-4o Mini (faster, cheaper)
 *   - "claude-sonnet" — Anthropic Claude Sonnet (requires @ai-sdk/anthropic)
 */
export const MODEL_CONFIG = {
  /** Default model identifier — read from env or fall back to gpt-4o */
  defaultModel: "gpt-4o" as const,

  /** Available model options */
  models: {
    "gpt-4o": { provider: "openai", modelId: "gpt-4o" },
    "gpt-4o-mini": { provider: "openai", modelId: "gpt-4o-mini" },
  } as Record<string, { provider: string; modelId: string }>,
} as const;

// ============================================================================
// Temperature Settings
// ============================================================================

/**
 * Temperature controls randomness in AI responses.
 * Lower = more deterministic (good for classification).
 * Higher = more creative (good for personalization).
 */
export const TEMPERATURE = {
  /** For classifying member responses into flow options */
  classification: 0.1,

  /** For personalizing message templates */
  personalization: 0.7,

  /** For generating follow-up messages */
  followUp: 0.6,

  /** For general conversation / free-form responses */
  conversation: 0.8,
} as const;

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Feature flags to toggle AI-enhanced features.
 * When disabled, the flow engine uses raw templates and exact string matching.
 * When enabled, the AI agent personalizes messages and interprets free-text.
 *
 * These can be overridden per-environment via Convex environment variables:
 *   AGENT_USE_AI_PERSONALIZATION = "true" | "false"
 *   AGENT_USE_AI_CLASSIFICATION  = "true" | "false"
 *   AGENT_USE_AI_FOLLOW_UP       = "true" | "false"
 */
export const FEATURE_FLAGS = {
  /**
   * When true, message templates are sent through the AI agent
   * to generate warm, personalized versions before sending.
   */
  useAiPersonalization: true,

  /**
   * When true, free-text member responses are sent through the AI agent
   * to classify them into the expected flow options (interested,
   * not_interested, reschedule, wants_to_meet, etc.).
   */
  useAiClassification: true,

  /**
   * When true, the AI agent generates contextual follow-up messages
   * when the flow needs one (e.g., after a delay, or when re-engaging).
   */
  useAiFollowUp: true,
} as const;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Read a feature flag, checking the Convex environment variable first,
 * then falling back to the static default.
 *
 * Usage (inside a Convex function):
 *   const useAi = getFeatureFlag("useAiPersonalization", process.env);
 */
export function getFeatureFlag(
  flag: keyof typeof FEATURE_FLAGS,
  env?: Record<string, string | undefined>,
): boolean {
  const envKey = `AGENT_${flag.replace(/([A-Z])/g, "_$1").toUpperCase()}`;
  const envValue = env?.[envKey];
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return FEATURE_FLAGS[flag];
}

/**
 * Get the model identifier to use, checking AGENT_MODEL env var first.
 */
export function getModelId(
  env?: Record<string, string | undefined>,
): string {
  return env?.AGENT_MODEL || MODEL_CONFIG.defaultModel;
}
