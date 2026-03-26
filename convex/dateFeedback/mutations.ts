// @ts-nocheck
/**
 * Date Feedback Mutations
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const saveCompatibilityScore = internalMutation({
  args: {
    matchId: v.id("matches"),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    overallScore: v.number(),
    lifestyle: v.number(),
    energy: v.number(),
    values: v.number(),
    attraction: v.number(),
    chemistry: v.number(),
    feedbackAId: v.optional(v.id("dateFeedback")),
    feedbackBId: v.optional(v.id("dateFeedback")),
    summary: v.optional(v.string()),
    strengths: v.optional(v.array(v.string())),
    weaknesses: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("compatibilityScores", {
      matchId: args.matchId,
      memberAId: args.memberAId,
      memberBId: args.memberBId,
      overallScore: args.overallScore,
      lifestyle: args.lifestyle,
      energy: args.energy,
      values: args.values,
      attraction: args.attraction,
      chemistry: args.chemistry,
      feedbackAId: args.feedbackAId,
      feedbackBId: args.feedbackBId,
      summary: args.summary,
      strengths: args.strengths,
      weaknesses: args.weaknesses,
      generatedAt: Date.now(),
    });
  },
});

export const updateMatchCss = internalMutation({
  args: {
    matchId: v.id("matches"),
    cssScore: v.number(),
    cssDimensions: v.any(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, any> = {
      cssScore: args.cssScore,
      cssDimensions: args.cssDimensions,
      updatedAt: Date.now(),
    };
    if (args.status) {
      patch.status = args.status;
    }
    await ctx.db.patch(args.matchId, patch);
  },
});

export const markCssGenerated = internalMutation({
  args: {
    feedbackIds: v.array(v.id("dateFeedback")),
  },
  handler: async (ctx, args) => {
    for (const id of args.feedbackIds) {
      await ctx.db.patch(id, { cssGenerated: true });
    }
  },
});
