/**
 * Model Pricing -- Queries & Mutations
 *
 * Manages the modelPricing table with current LLM pricing data.
 * Provides:
 *   - Seed mutation for initial pricing data
 *   - Mutation to update individual pricing entries
 *   - Query to get current pricing for the dashboard
 *   - Internal query for cost calculation lookups
 *   - Query to check pricing staleness
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { requireAuth } from "../auth/authz";

// ============================================================================
// Default pricing data (as of March 2026)
// ============================================================================

interface DefaultPricingEntry {
  provider: string;
  model: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  sourceUrl: string;
}

const DEFAULT_PRICING: DefaultPricingEntry[] = [
  {
    provider: "openai",
    model: "gpt-4o",
    inputPricePerMillion: 2500, // $2.50 per 1M input tokens
    outputPricePerMillion: 10000, // $10.00 per 1M output tokens
    sourceUrl: "https://openai.com/api/pricing/",
  },
  {
    provider: "openai",
    model: "gpt-4o-mini",
    inputPricePerMillion: 150, // $0.15 per 1M input tokens
    outputPricePerMillion: 600, // $0.60 per 1M output tokens
    sourceUrl: "https://openai.com/api/pricing/",
  },
  {
    provider: "openai",
    model: "gpt-4o-realtime-preview",
    inputPricePerMillion: 5000, // $5.00 per 1M input tokens
    outputPricePerMillion: 20000, // $20.00 per 1M output tokens
    sourceUrl: "https://openai.com/api/pricing/",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    inputPricePerMillion: 3000, // $3.00 per 1M input tokens
    outputPricePerMillion: 15000, // $15.00 per 1M output tokens
    sourceUrl: "https://docs.anthropic.com/en/docs/about-claude/models",
  },
  {
    provider: "google",
    model: "gemini-3-flash-preview",
    inputPricePerMillion: 150, // $0.15 per 1M input tokens
    outputPricePerMillion: 600, // $0.60 per 1M output tokens
    sourceUrl: "https://ai.google.dev/pricing",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-4o",
    inputPricePerMillion: 2500,
    outputPricePerMillion: 10000,
    sourceUrl: "https://openrouter.ai/models",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    inputPricePerMillion: 150,
    outputPricePerMillion: 600,
    sourceUrl: "https://openrouter.ai/models",
  },
  {
    provider: "openrouter",
    model: "google/gemini-3-flash-preview",
    inputPricePerMillion: 150,
    outputPricePerMillion: 600,
    sourceUrl: "https://openrouter.ai/models",
  },
];

// ============================================================================
// Mutations
// ============================================================================

/**
 * Seed or update pricing data. Safe to call multiple times -- upserts by
 * provider+model.
 */
export const seedPricing = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    for (const pricing of DEFAULT_PRICING) {
      const existing = await ctx.db
        .query("modelPricing")
        .withIndex("by_provider_model", (q) =>
          q.eq("provider", pricing.provider).eq("model", pricing.model),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          inputPricePerMillion: pricing.inputPricePerMillion,
          outputPricePerMillion: pricing.outputPricePerMillion,
          sourceUrl: pricing.sourceUrl,
          lastSyncedAt: now,
        });
      } else {
        await ctx.db.insert("modelPricing", {
          provider: pricing.provider,
          model: pricing.model,
          inputPricePerMillion: pricing.inputPricePerMillion,
          outputPricePerMillion: pricing.outputPricePerMillion,
          effectiveDate: now,
          sourceUrl: pricing.sourceUrl,
          lastSyncedAt: now,
        });
      }
    }

    return { seeded: DEFAULT_PRICING.length };
  },
});

/**
 * Update pricing for a single provider+model. Used by the sync action
 * and manual admin overrides.
 */
export const updatePricing = internalMutation({
  args: {
    provider: v.string(),
    model: v.string(),
    inputPricePerMillion: v.number(),
    outputPricePerMillion: v.number(),
    sourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("modelPricing")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        inputPricePerMillion: args.inputPricePerMillion,
        outputPricePerMillion: args.outputPricePerMillion,
        sourceUrl: args.sourceUrl,
        lastSyncedAt: now,
      });
    } else {
      await ctx.db.insert("modelPricing", {
        provider: args.provider,
        model: args.model,
        inputPricePerMillion: args.inputPricePerMillion,
        outputPricePerMillion: args.outputPricePerMillion,
        effectiveDate: now,
        sourceUrl: args.sourceUrl,
        lastSyncedAt: now,
      });
    }
  },
});

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all current pricing data (for the dashboard).
 */
export const getCurrentPricing = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db.query("modelPricing").collect();
  },
});

/**
 * Internal query to look up pricing for cost calculation.
 * Returns the price per million tokens for a provider+model combo.
 */
export const getPricingForModel = internalQuery({
  args: {
    provider: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    // Try exact match first
    let pricing = await ctx.db
      .query("modelPricing")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .first();

    // Fallback: try just by model name (handles openrouter/openai mapping)
    if (!pricing) {
      pricing = await ctx.db
        .query("modelPricing")
        .withIndex("by_model", (q) => q.eq("model", args.model))
        .first();
    }

    if (!pricing) {
      return null;
    }

    return {
      inputPricePerMillion: pricing.inputPricePerMillion,
      outputPricePerMillion: pricing.outputPricePerMillion,
    };
  },
});

/** Staleness status for pricing data. */
type StalenessStatus = "up_to_date" | "stale" | "unknown";

interface PricingStalenessResult {
  status: StalenessStatus;
  lastSyncedAt: number | null;
  modelCount: number;
}

/**
 * Get pricing staleness information for the dashboard badge.
 * Returns a status: "up_to_date" (< 7 days), "stale" (> 7 days), or "unknown" (no data).
 */
export const getPricingStaleness = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PricingStalenessResult> => {
    await requireAuth(ctx, args.sessionToken);

    const allPricing = await ctx.db.query("modelPricing").collect();

    if (allPricing.length === 0) {
      return { status: "unknown", lastSyncedAt: null, modelCount: 0 };
    }

    const latestSync = Math.max(
      ...allPricing.map((p) => p.lastSyncedAt),
    );

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const status: StalenessStatus =
      latestSync >= sevenDaysAgo ? "up_to_date" : "stale";

    return {
      status,
      lastSyncedAt: latestSync,
      modelCount: allPricing.length,
    };
  },
});

// ============================================================================
// Cost Calculation Helper (pure function, no DB)
// ============================================================================

/**
 * Calculate cost in USD from token counts and pricing.
 * Prices are stored as cents per million tokens.
 *
 * @param inputTokens - number of input tokens
 * @param outputTokens - number of output tokens
 * @param inputPricePerMillion - price in cents per million input tokens
 * @param outputPricePerMillion - price in cents per million output tokens
 * @returns cost in USD (not cents)
 */
export function calculateCostUsd(
  inputTokens: number,
  outputTokens: number,
  inputPricePerMillion: number,
  outputPricePerMillion: number,
): number {
  const inputCost = (inputTokens / 1_000_000) * (inputPricePerMillion / 100);
  const outputCost =
    (outputTokens / 1_000_000) * (outputPricePerMillion / 100);
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
