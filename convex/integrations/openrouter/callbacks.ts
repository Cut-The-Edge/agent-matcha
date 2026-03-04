// @ts-nocheck
/**
 * OpenRouter Callbacks
 *
 * Internal mutations/queries used by OpenRouter analysis actions.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../../_generated/server";

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

/**
 * Load all feedback records for a member (used by recalibration analysis).
 */
export const getFeedbackByMember = internalQuery({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("feedback")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
  },
});
