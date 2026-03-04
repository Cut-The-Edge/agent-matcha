// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Log a new phone call (called by voice agent via HTTP).
 */
export const logCall = internalMutation({
  args: {
    livekitRoomId: v.string(),
    sipCallId: v.optional(v.string()),
    memberId: v.optional(v.id("members")),
    phone: v.optional(v.string()),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const callId = await ctx.db.insert("phoneCalls", {
      livekitRoomId: args.livekitRoomId,
      sipCallId: args.sipCallId,
      memberId: args.memberId,
      phone: args.phone,
      direction: args.direction,
      status: "in_progress",
      startedAt: now,
      createdAt: now,
    });
    return callId;
  },
});

/**
 * Update a call record when the call ends.
 */
export const updateCall = internalMutation({
  args: {
    callId: v.id("phoneCalls"),
    status: v.union(
      v.literal("completed"),
      v.literal("transferred"),
      v.literal("failed"),
      v.literal("no_answer"),
    ),
    duration: v.optional(v.number()),
    transcript: v.optional(v.any()),
    aiSummary: v.optional(v.any()),
    extractedData: v.optional(v.any()),
    profileAction: v.optional(
      v.union(v.literal("created"), v.literal("updated"), v.literal("none"))
    ),
    qualityFlags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { callId, ...updates } = args;
    await ctx.db.patch(callId, {
      ...updates,
      endedAt: Date.now(),
    });
  },
});

/**
 * Add a transcript segment (real-time streaming from voice agent).
 */
export const addTranscriptSegment = internalMutation({
  args: {
    callId: v.id("phoneCalls"),
    speaker: v.union(v.literal("caller"), v.literal("agent")),
    text: v.string(),
    timestamp: v.number(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("callTranscriptSegments", {
      callId: args.callId,
      speaker: args.speaker,
      text: args.text,
      timestamp: args.timestamp,
      confidence: args.confidence,
    });
  },
});

/**
 * Save extracted intake data to the call record.
 */
export const saveIntakeData = internalMutation({
  args: {
    callId: v.id("phoneCalls"),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    // Merge new data with existing extracted data
    const existing = (call.extractedData as Record<string, unknown>) ?? {};
    await ctx.db.patch(args.callId, {
      extractedData: { ...existing, ...args.data },
    });
  },
});

/**
 * Record an escalation on a call.
 */
export const recordEscalation = internalMutation({
  args: {
    callId: v.id("phoneCalls"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      escalationReason: args.reason,
      status: "transferred",
    });
  },
});

/**
 * Flag a call for quality review (called from dashboard).
 */
export const flagCall = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    callId: v.id("phoneCalls"),
    flag: v.string(),
  },
  handler: async (ctx, args) => {
    const call = await ctx.db.get(args.callId);
    if (!call) throw new Error("Call not found");

    const existing = call.qualityFlags ?? [];
    if (!existing.includes(args.flag)) {
      await ctx.db.patch(args.callId, {
        qualityFlags: [...existing, args.flag],
      });
    }
  },
});

/**
 * Update SMA sync status on a call.
 */
export const updateSmaSyncStatus = internalMutation({
  args: {
    callId: v.id("phoneCalls"),
    status: v.union(
      v.literal("pending"),
      v.literal("synced"),
      v.literal("failed"),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.callId, {
      smaSyncStatus: args.status,
    });
  },
});
