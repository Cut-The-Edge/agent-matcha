// @ts-nocheck
/**
 * Date Feedback Queries
 */

import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";

export const getByMatch = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dateFeedback")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();
  },
});

export const getByMember = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("dateFeedback")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
  },
});

export const getCssByMatch = query({
  args: { matchId: v.id("matches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("compatibilityScores")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .first();
  },
});

/**
 * List all date feedback with member names and CSS scores.
 * Used by the dashboard Date Feedback page.
 */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    const feedback = await ctx.db
      .query("dateFeedback")
      .order("desc")
      .take(200);

    const results = [];
    for (const fb of feedback) {
      const member = await ctx.db.get(fb.memberId);
      const match = await ctx.db.get(fb.matchId);
      if (!member || !match) continue;

      const partnerId = match.memberAId === fb.memberId ? match.memberBId : match.memberAId;
      const partner = await ctx.db.get(partnerId);

      // Check for CSS score on this match
      const css = await ctx.db
        .query("compatibilityScores")
        .withIndex("by_match", (q) => q.eq("matchId", fb.matchId))
        .first();

      results.push({
        _id: fb._id,
        matchId: fb.matchId,
        memberId: fb.memberId,
        memberName: member.firstName + (member.lastName ? ` ${member.lastName}` : ""),
        partnerName: partner?.firstName || "Unknown",
        overallRating: fb.overallRating,
        wouldSeeAgain: fb.wouldSeeAgain,
        positiveSignals: fb.positiveSignals,
        negativeCategories: fb.negativeCategories,
        negativeSubCategories: fb.negativeSubCategories,
        freeText: fb.freeText,
        cssScore: css?.overallScore ?? null,
        cssDimensions: css ? {
          lifestyle: css.lifestyle,
          energy: css.energy,
          values: css.values,
          attraction: css.attraction,
          chemistry: css.chemistry,
        } : null,
        cssSummary: css?.summary ?? null,
        cssStrengths: css?.strengths ?? null,
        cssWeaknesses: css?.weaknesses ?? null,
        createdAt: fb.createdAt,
      });
    }

    return results;
  },
});
