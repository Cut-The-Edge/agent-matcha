// @ts-nocheck
/**
 * OpenRouter Callbacks
 *
 * Internal mutation to patch the feedback record with LLM analysis results.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/**
 * Update a feedback record with the structured LLM analysis.
 */
export const updateFeedbackAnalysis = internalMutation({
  args: {
    feedbackId: v.id("feedback"),
    llmAnalysis: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.feedbackId, {
      llmAnalysis: args.llmAnalysis,
    });
  },
});
