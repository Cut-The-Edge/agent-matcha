// @ts-nocheck
import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * Log an outbound WhatsApp message.
 * Used when Agent Matcha sends a message to a member.
 */
export const sendMessage = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    content: v.string(),
    messageType: v.union(
      v.literal("text"),
      v.literal("interactive"),
      v.literal("template"),
      v.literal("media")
    ),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Validate member exists
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    // Validate match exists if matchId provided
    if (args.matchId) {
      const match = await ctx.db.get(args.matchId);
      if (!match) {
        throw new Error(`Match not found: ${args.matchId}`);
      }
    }

    const now = Date.now();

    const messageId = await ctx.db.insert("whatsappMessages", {
      memberId: args.memberId,
      matchId: args.matchId,
      direction: "outbound",
      messageType: args.messageType,
      content: args.content,
      twilioSid: args.twilioSid,
      status: "sent",
      createdAt: now,
    });

    return messageId;
  },
});

/**
 * Log an inbound WhatsApp message.
 * Used when a member sends a message to Agent Matcha.
 * Automatically tries to find an active match for this member to set matchId.
 */
export const receiveMessage = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    content: v.string(),
    messageType: v.optional(
      v.union(
        v.literal("text"),
        v.literal("interactive"),
        v.literal("template"),
        v.literal("media")
      )
    ),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Validate member exists
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    // Try to find an active match for this member to associate the message
    const terminalStatuses = new Set([
      "completed",
      "expired",
      "rejected",
      "past",
    ]);

    let activeMatchId = undefined;

    // Check matches where member is A
    const matchesAsA = await ctx.db
      .query("matches")
      .withIndex("by_memberA", (q) => q.eq("memberAId", args.memberId))
      .collect();

    // Check matches where member is B
    const matchesAsB = await ctx.db
      .query("matches")
      .withIndex("by_memberB", (q) => q.eq("memberBId", args.memberId))
      .collect();

    const allMatches = [...matchesAsA, ...matchesAsB];

    // Find most recent active (non-terminal) match
    const activeMatches = allMatches
      .filter((m) => !terminalStatuses.has(m.status))
      .sort((a, b) => b.createdAt - a.createdAt);

    if (activeMatches.length > 0) {
      activeMatchId = activeMatches[0]._id;
    }

    const now = Date.now();

    const messageId = await ctx.db.insert("whatsappMessages", {
      memberId: args.memberId,
      matchId: activeMatchId,
      direction: "inbound",
      messageType: args.messageType ?? "text",
      content: args.content,
      twilioSid: args.twilioSid,
      status: "delivered",
      createdAt: now,
    });

    return messageId;
  },
});

/**
 * Update delivery status of a WhatsApp message (sent -> delivered -> read -> failed).
 * Typically called via Twilio webhook callbacks.
 */
export const updateMessageStatus = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    messageId: v.id("whatsappMessages"),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.messageId);
    if (!existing) {
      throw new Error(`Message not found: ${args.messageId}`);
    }

    await ctx.db.patch(args.messageId, {
      status: args.status,
    });

    return args.messageId;
  },
});

/**
 * Update delivery status by Twilio SID.
 * Alternative to updateMessageStatus when we only have the Twilio SID from a webhook.
 */
export const updateStatusByTwilioSid = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    twilioSid: v.string(),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed")
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Find message by twilioSid (no index, so scan in memory)
    const allMessages = await ctx.db.query("whatsappMessages").collect();
    const message = allMessages.find((m) => m.twilioSid === args.twilioSid);

    if (!message) {
      throw new Error(`Message with Twilio SID not found: ${args.twilioSid}`);
    }

    await ctx.db.patch(message._id, {
      status: args.status,
    });

    return message._id;
  },
});
