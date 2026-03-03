// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * Record feedback for a match.
 * Creates a feedback entry with the member's decision, optional categories, and optional free text.
 * Sets smaMatchNotesSynced=false so it can be picked up for SMA sync later.
 */
export const create = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
    memberId: v.id("members"),
    decision: v.union(
      v.literal("interested"),
      v.literal("not_interested"),
      v.literal("passed")
    ),
    categories: v.optional(
      v.array(
        v.union(
          v.literal("physical_attraction"),
          v.literal("photos_only"),
          v.literal("chemistry"),
          v.literal("willingness_to_meet"),
          v.literal("age_preference"),
          v.literal("location"),
          v.literal("career_income"),
          v.literal("something_specific")
        )
      )
    ),
    freeText: v.optional(v.string()),
    voiceNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Validate match exists
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match not found: ${args.matchId}`);
    }

    // Validate member exists and is part of this match
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    if (match.memberAId !== args.memberId && match.memberBId !== args.memberId) {
      throw new Error(
        `Member ${args.memberId} is not part of match ${args.matchId}`
      );
    }

    const now = Date.now();

    const feedbackId = await ctx.db.insert("feedback", {
      matchId: args.matchId,
      memberId: args.memberId,
      decision: args.decision,
      categories: args.categories,
      freeText: args.freeText,
      voiceNote: args.voiceNote,
      smaMatchNotesSynced: false,
      createdAt: now,
    });

    return feedbackId;
  },
});

/**
 * Mark a feedback entry as synced to SmartMatchApp.
 * Internal mutation — called by the SMA sync job after successfully writing to SMA.
 */
export const markSynced = internalMutation({
  args: {
    feedbackId: v.id("feedback"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.feedbackId);
    if (!existing) {
      throw new Error(`Feedback not found: ${args.feedbackId}`);
    }

    await ctx.db.patch(args.feedbackId, {
      smaMatchNotesSynced: true,
    });

    return args.feedbackId;
  },
});

/**
 * Batch mark multiple feedback entries as synced.
 * Internal mutation — used by batch SMA sync jobs.
 */
export const markSyncedBatch = internalMutation({
  args: {
    feedbackIds: v.array(v.id("feedback")),
  },
  handler: async (ctx, args) => {
    for (const feedbackId of args.feedbackIds) {
      const existing = await ctx.db.get(feedbackId);
      if (existing) {
        await ctx.db.patch(feedbackId, {
          smaMatchNotesSynced: true,
        });
      }
    }

    return { synced: args.feedbackIds.length };
  },
});
