// @ts-nocheck
"use node";
/**
 * Pricing Sync Action
 *
 * Fetches current LLM pricing from OpenRouter and updates the local table.
 * Separated from pricingSync.ts because actions require "use node" runtime.
 */

import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Fetch current pricing from OpenRouter API and update the local table.
 * OpenRouter exposes model pricing in its /models endpoint.
 */
export const syncPricingFromOpenRouter = internalAction({
  args: {},
  handler: async (ctx) => {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/models");

      if (!response.ok) {
        console.error(
          `[pricingSync] OpenRouter API error: ${response.status}`,
        );
        return { success: false, error: `HTTP ${response.status}` };
      }

      const data = await response.json();
      const models = data?.data;

      if (!Array.isArray(models)) {
        return { success: false, error: "Unexpected API response format" };
      }

      // Models we care about
      const targetModels = [
        "openai/gpt-4o",
        "openai/gpt-4o-mini",
        "google/gemini-3-flash-preview",
      ];

      let updated = 0;

      for (const model of models) {
        if (targetModels.includes(model.id) && model.pricing) {
          const inputPrice = parseFloat(model.pricing.prompt) * 1_000_000;
          const outputPrice =
            parseFloat(model.pricing.completion) * 1_000_000;

          if (!isNaN(inputPrice) && !isNaN(outputPrice)) {
            await ctx.runMutation(
              internal.analytics.pricingSync.updatePricing,
              {
                provider: "openrouter",
                model: model.id,
                inputPricePerMillion: Math.round(inputPrice * 100) / 100,
                outputPricePerMillion: Math.round(outputPrice * 100) / 100,
                sourceUrl: "https://openrouter.ai/api/v1/models",
              },
            );
            updated++;
          }
        }
      }

      return { success: true, modelsUpdated: updated };
    } catch (error: any) {
      console.error(
        "[pricingSync] Failed to sync from OpenRouter:",
        error?.message,
      );
      return { success: false, error: error?.message };
    }
  },
});
