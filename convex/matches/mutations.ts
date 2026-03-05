// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/** All valid match statuses per §7.1. */
const matchStatusValidator = v.union(
  v.literal("active"),
  v.literal("rejected"),
  v.literal("past"),
  v.literal("pending"),
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
  "rejected",
  "past",
]);

/**
 * Create a new match between two members.
 * Sets status="active" (Active Introductions — §7.1).
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

    const memberA = await ctx.db.get(args.memberAId);
    if (!memberA) {
      throw new Error(`Member A not found: ${args.memberAId}`);
    }
    const memberB = await ctx.db.get(args.memberBId);
    if (!memberB) {
      throw new Error(`Member B not found: ${args.memberBId}`);
    }

    if (args.memberAId === args.memberBId) {
      throw new Error("Cannot create a match between a member and themselves");
    }

    const now = Date.now();

    const matchId = await ctx.db.insert("matches", {
      memberAId: args.memberAId,
      memberBId: args.memberBId,
      smaIntroId: args.smaIntroId,
      status: "active",
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
 * Record a member's response to a match.
 * Creates a feedback record and updates match status per §7.1:
 *  - not_interested → "rejected"
 *  - passed → "past"
 *  - interested → stays "active" (Flow A TBD)
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
    categories: v.optional(v.array(v.string())),
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

    const isA = match.memberAId === args.memberId;
    const isB = match.memberBId === args.memberId;
    if (!isA && !isB) {
      throw new Error(
        `Member ${args.memberId} is not part of match ${args.matchId}`
      );
    }

    const now = Date.now();

    await ctx.db.insert("feedback", {
      matchId: args.matchId,
      memberId: args.memberId,
      decision: args.decision,
      categories: args.categories,
      freeText: args.freeText,
      smaMatchNotesSynced: false,
      createdAt: now,
    });

    // §7.1 status mapping
    let newStatus: string = match.status;
    let responseType: string | undefined;

    if (args.decision === "not_interested") {
      newStatus = "rejected";
      responseType = "not_interested";
    } else if (args.decision === "passed") {
      newStatus = "past";
      responseType = "upsell_no_pass";
    } else {
      // interested — stays active (Flow A TBD)
      responseType = "interested";
    }

    await ctx.db.patch(args.matchId, {
      status: newStatus,
      responseType,
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
      return { matchId: args.matchId, alreadyTerminal: true };
    }

    await ctx.db.patch(args.matchId, {
      status: "expired",
      responseType: "no_response",
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
 * Update a match's SMA group/status fields from a webhook event.
 * Auto-maps certain SMA groups to our internal match statuses.
 */
export const updateMatchFromSma = internalMutation({
  args: {
    smaIntroId: v.string(),
    smaGroupId: v.optional(v.number()),
    smaGroupName: v.optional(v.string()),
    smaStatusId: v.optional(v.number()),
    smaStatusName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("matches")
      .withIndex("by_smaIntroId", (q) => q.eq("smaIntroId", args.smaIntroId))
      .first();

    if (!match) {
      console.warn(`updateMatchFromSma: no match found for smaIntroId=${args.smaIntroId}`);
      return { found: false };
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.smaGroupId !== undefined) updates.smaGroupId = args.smaGroupId;
    if (args.smaGroupName !== undefined) updates.smaGroupName = args.smaGroupName;
    if (args.smaStatusId !== undefined) updates.smaStatusId = args.smaStatusId;
    if (args.smaStatusName !== undefined) updates.smaStatusName = args.smaStatusName;

    // Auto-map SMA group → our internal status for terminal groups
    const GROUP_STATUS_MAP: Record<string, string> = {
      "Rejected Introductions": "rejected",
      "Not Suitable": "rejected",
      "Past Introductions": "past",
      "Successful Matches": "completed",
    };

    const groupName = args.smaGroupName;
    if (groupName && GROUP_STATUS_MAP[groupName]) {
      updates.status = GROUP_STATUS_MAP[groupName];
    }

    await ctx.db.patch(match._id, updates);
    return { found: true, matchId: match._id, updatedStatus: updates.status };
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
      status: "completed",
      updatedAt: Date.now(),
    });

    return args.matchId;
  },
});
