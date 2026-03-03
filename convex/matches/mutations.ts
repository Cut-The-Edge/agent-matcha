// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/** All valid match statuses, matching the schema. */
const matchStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent_a"),
  v.literal("sent_b"),
  v.literal("a_interested"),
  v.literal("b_interested"),
  v.literal("mutual_interest"),
  v.literal("group_created"),
  v.literal("a_declined"),
  v.literal("b_declined"),
  v.literal("a_passed"),
  v.literal("b_passed"),
  v.literal("personal_outreach_a"),
  v.literal("personal_outreach_b"),
  v.literal("completed"),
  v.literal("expired")
);

/**
 * Terminal statuses — once a match reaches one of these, it cannot be changed
 * by normal status updates.
 */
const TERMINAL_STATUSES = new Set([
  "completed",
  "expired",
  "a_declined",
  "b_declined",
]);

/**
 * Create a new match between two members.
 * Sets status="pending", createdAt, updatedAt.
 * triggeredBy is the admin who initiated the match.
 */
export const create = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    smaIntroId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);

    // Validate both members exist
    const memberA = await ctx.db.get(args.memberAId);
    if (!memberA) {
      throw new Error(`Member A not found: ${args.memberAId}`);
    }
    const memberB = await ctx.db.get(args.memberBId);
    if (!memberB) {
      throw new Error(`Member B not found: ${args.memberBId}`);
    }

    // Prevent matching a member with themselves
    if (args.memberAId === args.memberBId) {
      throw new Error("Cannot create a match between a member and themselves");
    }

    const now = Date.now();

    const matchId = await ctx.db.insert("matches", {
      memberAId: args.memberAId,
      memberBId: args.memberBId,
      smaIntroId: args.smaIntroId,
      status: "pending",
      triggeredBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    return matchId;
  },
});

/**
 * Update match status + updatedAt.
 * Validates the transition is allowed (not from a terminal state).
 * If both parties have expressed interest (status moving to mutual_interest),
 * this is handled explicitly by the caller or by updateMemberResponse logic.
 */
export const updateStatus = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
    status: matchStatusValidator,
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match not found: ${args.matchId}`);
    }

    if (TERMINAL_STATUSES.has(match.status)) {
      throw new Error(
        `Cannot update match in terminal status "${match.status}"`
      );
    }

    await ctx.db.patch(args.matchId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return args.matchId;
  },
});

/**
 * Record a member's response to a match (interested, declined, passed).
 * Creates a feedback record and advances match status accordingly.
 *
 * Logic:
 * - If member A responds "interested" -> status becomes "a_interested"
 *   (unless B already interested, then "mutual_interest")
 * - If member A responds "not_interested" -> status becomes "a_declined"
 * - If member A responds "passed" -> status becomes "a_passed"
 * - Same logic symmetrically for member B.
 */
export const updateMemberResponse = mutation({
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
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match not found: ${args.matchId}`);
    }

    if (TERMINAL_STATUSES.has(match.status)) {
      throw new Error(
        `Cannot update response for match in terminal status "${match.status}"`
      );
    }

    // Determine which side this member is
    const isA = match.memberAId === args.memberId;
    const isB = match.memberBId === args.memberId;
    if (!isA && !isB) {
      throw new Error(
        `Member ${args.memberId} is not part of match ${args.matchId}`
      );
    }

    const side = isA ? "a" : "b";
    const otherSide = isA ? "b" : "a";
    const now = Date.now();

    // Record the feedback
    await ctx.db.insert("feedback", {
      matchId: args.matchId,
      memberId: args.memberId,
      decision: args.decision,
      categories: args.categories,
      freeText: args.freeText,
      smaMatchNotesSynced: false,
      createdAt: now,
    });

    // Determine new match status
    let newStatus: string;

    if (args.decision === "not_interested") {
      newStatus = `${side}_declined`;
    } else if (args.decision === "passed") {
      newStatus = `${side}_passed`;
    } else {
      // interested
      // Check if the other side is already interested
      const otherInterestedStatus = `${otherSide}_interested`;
      if (match.status === otherInterestedStatus) {
        newStatus = "mutual_interest";
      } else {
        newStatus = `${side}_interested`;
      }
    }

    await ctx.db.patch(args.matchId, {
      status: newStatus,
      updatedAt: now,
    });

    return { matchId: args.matchId, newStatus };
  },
});

/**
 * Mark match as expired if past its natural lifecycle.
 * Internal mutation — called by scheduled jobs / cron.
 */
export const expire = internalMutation({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match not found: ${args.matchId}`);
    }

    if (TERMINAL_STATUSES.has(match.status)) {
      // Already in a terminal state, nothing to do
      return { matchId: args.matchId, alreadyTerminal: true };
    }

    await ctx.db.patch(args.matchId, {
      status: "expired",
      updatedAt: Date.now(),
    });

    return { matchId: args.matchId, alreadyTerminal: false };
  },
});

/**
 * Mark match as completed, set updatedAt.
 */
export const complete = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match not found: ${args.matchId}`);
    }

    await ctx.db.patch(args.matchId, {
      status: "completed",
      updatedAt: Date.now(),
    });

    return args.matchId;
  },
});

/**
 * Set or update the groupChatId for a match (used when a WhatsApp group is created).
 */
export const setGroupChat = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
    groupChatId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const match = await ctx.db.get(args.matchId);
    if (!match) {
      throw new Error(`Match not found: ${args.matchId}`);
    }

    await ctx.db.patch(args.matchId, {
      groupChatId: args.groupChatId,
      status: "group_created",
      updatedAt: Date.now(),
    });

    return args.matchId;
  },
});
