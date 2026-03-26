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

/**
 * Aggregate all CSS scores for a member and update their compatibilityProfile.
 * Called after each new CSS is generated — recalculates running averages
 * and deduplicates top strengths/weaknesses across all dates.
 */
export const updateMemberCompatibilityProfile = internalMutation({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    // Find all CSS scores where this member was involved
    const asA = await ctx.db
      .query("compatibilityScores")
      .withIndex("by_memberA", (q) => q.eq("memberAId", args.memberId))
      .collect();
    const asB = await ctx.db
      .query("compatibilityScores")
      .withIndex("by_memberB", (q) => q.eq("memberBId", args.memberId))
      .collect();

    const allScores = [...asA, ...asB];
    if (allScores.length === 0) return;

    // Calculate running average CSS
    const totalDates = allScores.length;
    const averageCss =
      Math.round(
        (allScores.reduce((sum, s) => sum + s.overallScore, 0) / totalDates) * 10
      ) / 10;

    // Aggregate strengths/weaknesses with frequency counting
    const strengthCounts: Record<string, number> = {};
    const weaknessCounts: Record<string, number> = {};
    for (const score of allScores) {
      for (const s of score.strengths || []) {
        strengthCounts[s] = (strengthCounts[s] || 0) + 1;
      }
      for (const w of score.weaknesses || []) {
        weaknessCounts[w] = (weaknessCounts[w] || 0) + 1;
      }
    }

    // Top 5 by frequency
    const bestSignals = Object.entries(strengthCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([signal]) => signal);
    const weakSignals = Object.entries(weaknessCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([signal]) => signal);

    await ctx.db.patch(args.memberId, {
      compatibilityProfile: {
        bestSignals,
        weakSignals,
        averageCss,
        totalDates,
        lastUpdatedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});
