// @ts-nocheck
/**
 * LLM Instrumentation Helpers
 *
 * Provides utility functions to log token usage after LLM calls.
 * Used by OpenRouter analyze.ts and agent flowBridge/matchaAgent calls.
 *
 * These helpers extract token counts from various LLM response formats
 * (OpenRouter raw JSON, AI SDK generateText result) and log them via
 * the tokenTracking mutation.
 */

import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================================================
// Types
// ============================================================================

type ProcessType =
  | "voice-intake"
  | "summarization"
  | "whatsapp-feedback"
  | "whatsapp-intro"
  | "whatsapp-personalization"
  | "whatsapp-classification"
  | "whatsapp-followup"
  | "feedback-analysis"
  | "recalibration-analysis"
  | "other";

type Provider =
  | "openai"
  | "anthropic"
  | "openrouter"
  | "google"
  | "other";

interface TokenUsageParams {
  processType: ProcessType;
  provider: Provider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs?: number;
  entityType?: string;
  entityId?: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

/** Shape of the usage field in an OpenRouter API response. */
interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

/** Shape of the usage field in an AI SDK generateText result. */
interface AiSdkUsage {
  promptTokens?: number;
  completionTokens?: number;
}

interface LogOpts {
  processType: ProcessType;
  model: string;
  latencyMs?: number;
  entityType?: string;
  entityId?: string;
  sessionId?: string;
}

interface LogOptsWithProvider extends LogOpts {
  provider: Provider;
}

// ============================================================================
// Default pricing fallback (cents per million tokens)
// Used when the modelPricing table hasn't been seeded yet.
// ============================================================================

const FALLBACK_PRICING: Record<
  string,
  { input: number; output: number }
> = {
  "gpt-4o": { input: 2500, output: 10000 },
  "openai/gpt-4o": { input: 2500, output: 10000 },
  "gpt-4o-mini": { input: 150, output: 600 },
  "openai/gpt-4o-mini": { input: 150, output: 600 },
  "gpt-4o-realtime-preview": { input: 5000, output: 20000 },
  "google/gemini-3-flash-preview": { input: 150, output: 600 },
  "gemini-3-flash-preview": { input: 150, output: 600 },
  "claude-sonnet-4-20250514": { input: 3000, output: 15000 },
};

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = FALLBACK_PRICING[model] ?? { input: 1000, output: 3000 };
  const inputCost =
    (inputTokens / 1_000_000) * (pricing.input / 100);
  const outputCost =
    (outputTokens / 1_000_000) * (pricing.output / 100);
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}

// ============================================================================
// Instrumentation Functions
// ============================================================================

/**
 * Log token usage from an OpenRouter raw API response.
 *
 * The OpenRouter response includes a `usage` field:
 * { prompt_tokens, completion_tokens, total_tokens }
 */
export async function logOpenRouterUsage(
  ctx: ActionCtx,
  openRouterResponse: { usage?: OpenRouterUsage },
  opts: LogOpts,
): Promise<void> {
  try {
    const usage = openRouterResponse?.usage;
    if (!usage) {
      console.warn("[instrumentLlm] No usage data in OpenRouter response");
      return;
    }

    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;

    await ctx.runMutation(internal.analytics.tokenTracking.logTokenUsage, {
      processType: opts.processType,
      provider: "openrouter",
      model: opts.model,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: calculateCost(opts.model, inputTokens, outputTokens),
      latencyMs: opts.latencyMs,
      entityType: opts.entityType,
      entityId: opts.entityId,
      sessionId: opts.sessionId,
    });
  } catch (error) {
    // Never let instrumentation errors break the main flow
    console.error("[instrumentLlm] Failed to log OpenRouter usage:", error);
  }
}

/**
 * Log token usage from an AI SDK generateText result.
 *
 * The AI SDK result includes:
 *   result.usage = { promptTokens, completionTokens }
 */
export async function logAiSdkUsage(
  ctx: ActionCtx,
  aiSdkResult: { usage?: AiSdkUsage },
  opts: LogOptsWithProvider,
): Promise<void> {
  try {
    const usage = aiSdkResult?.usage;
    if (!usage) {
      console.warn("[instrumentLlm] No usage data in AI SDK result");
      return;
    }

    const inputTokens = usage.promptTokens ?? 0;
    const outputTokens = usage.completionTokens ?? 0;
    const totalTokens = inputTokens + outputTokens;

    await ctx.runMutation(internal.analytics.tokenTracking.logTokenUsage, {
      processType: opts.processType,
      provider: opts.provider,
      model: opts.model,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd: calculateCost(opts.model, inputTokens, outputTokens),
      latencyMs: opts.latencyMs,
      entityType: opts.entityType,
      entityId: opts.entityId,
      sessionId: opts.sessionId,
    });
  } catch (error) {
    // Never let instrumentation errors break the main flow
    console.error("[instrumentLlm] Failed to log AI SDK usage:", error);
  }
}

/**
 * Log token usage with explicit token counts (manual).
 * Use this when the token counts are extracted manually from a response.
 */
export async function logManualUsage(
  ctx: ActionCtx,
  params: TokenUsageParams,
): Promise<void> {
  try {
    const totalTokens = params.inputTokens + params.outputTokens;

    await ctx.runMutation(internal.analytics.tokenTracking.logTokenUsage, {
      processType: params.processType,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens,
      costUsd: calculateCost(
        params.model,
        params.inputTokens,
        params.outputTokens,
      ),
      latencyMs: params.latencyMs,
      entityType: params.entityType,
      entityId: params.entityId,
      sessionId: params.sessionId,
      metadata: params.metadata,
    });
  } catch (error) {
    console.error("[instrumentLlm] Failed to log manual usage:", error);
  }
}
