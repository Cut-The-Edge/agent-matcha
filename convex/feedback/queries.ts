// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * Get all feedback entries for a specific match.
 * Returns entries ordered by createdAt ascending.
 */
export const listByMatch = query({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const feedbackEntries = await ctx.db
      .query("feedback")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();

    // Resolve member names for each entry
    const enriched = await Promise.all(
      feedbackEntries.map(async (entry) => {
        const member = await ctx.db.get(entry.memberId);
        return {
          ...entry,
          memberName: member
            ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
            : "Unknown",
        };
      })
    );

    return enriched;
  },
});

/**
 * Get all feedback from a specific member (their response history).
 * Returns entries ordered by createdAt descending (most recent first).
 */
export const listByMember = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 100;

    const feedbackEntries = await ctx.db
      .query("feedback")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();

    // Sort by createdAt desc and limit
    const sorted = feedbackEntries
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);

    // Resolve match details for each entry
    const enriched = await Promise.all(
      sorted.map(async (entry) => {
        const match = await ctx.db.get(entry.matchId);
        let otherMemberName = "Unknown";
        if (match) {
          const otherMemberId =
            match.memberAId === args.memberId
              ? match.memberBId
              : match.memberAId;
          const otherMember = await ctx.db.get(otherMemberId);
          if (otherMember) {
            otherMemberName = `${otherMember.firstName}${otherMember.lastName ? ` ${otherMember.lastName}` : ""}`;
          }
        }
        return {
          ...entry,
          matchStatus: match?.status ?? "unknown",
          otherMemberName,
        };
      })
    );

    return enriched;
  },
});

/**
 * Aggregate feedback by category for analytics.
 * Returns counts for each feedback category and decision type.
 */
export const getCategoryStats = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allFeedback = await ctx.db.query("feedback").collect();

    const byDecision: Record<string, number> = {
      interested: 0,
      not_interested: 0,
      passed: 0,
    };

    const byCategory: Record<string, number> = {
      physical_attraction: 0,
      photos_only: 0,
      chemistry: 0,
      willingness_to_meet: 0,
      age_preference: 0,
      location: 0,
      career_income: 0,
      something_specific: 0,
    };

    let totalWithCategories = 0;
    let totalWithFreeText = 0;

    for (const entry of allFeedback) {
      byDecision[entry.decision] = (byDecision[entry.decision] ?? 0) + 1;

      if (entry.categories && entry.categories.length > 0) {
        totalWithCategories++;
        for (const cat of entry.categories) {
          byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        }
      }

      if (entry.freeText) {
        totalWithFreeText++;
      }
    }

    return {
      total: allFeedback.length,
      byDecision,
      byCategory,
      totalWithCategories,
      totalWithFreeText,
    };
  },
});

/**
 * Get all feedback entries that have NOT been synced to SmartMatchApp.
 * Used by the SMA sync job to find entries to push.
 */
export const getUnsynced = query({
  args: {
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 50;

    const allFeedback = await ctx.db.query("feedback").collect();

    const unsynced = allFeedback
      .filter((f) => !f.smaMatchNotesSynced)
      .slice(0, limit);

    return unsynced;
  },
});
