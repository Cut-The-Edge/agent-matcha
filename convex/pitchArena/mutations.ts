// @ts-nocheck
/**
 * Pitch Arena Mutations
 *
 * Session lifecycle for the Live Call Pitch Arena (CUT-345).
 * Dani calls a match from the dashboard, generates pitches in real time.
 */

import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authz";

/**
 * Create a new Pitch Arena session + phone call record.
 * Called when Dani clicks "Start Call" in the Pitch Arena.
 */
export const createSession = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    matchMemberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    actionItemId: v.optional(v.id("actionQueue")),
    livekitRoomName: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const now = Date.now();

    // Create a phone call record (reuses existing infrastructure)
    const callId = await ctx.db.insert("phoneCalls", {
      livekitRoomId: args.livekitRoomName,
      phone: args.phone,
      memberId: args.matchMemberId,
      direction: "outbound",
      status: "in_progress",
      startedAt: now,
      createdAt: now,
    });

    const sessionId = await ctx.db.insert("pitchArenaSessions", {
      callId,
      memberId: args.memberId,
      matchMemberId: args.matchMemberId,
      matchId: args.matchId,
      actionItemId: args.actionItemId,
      livekitRoomName: args.livekitRoomName,
      status: "active",
      createdAt: now,
    });

    // If linked to an action item, mark it in_progress
    if (args.actionItemId) {
      const item = await ctx.db.get(args.actionItemId);
      if (item && item.status === "pending") {
        await ctx.db.patch(args.actionItemId, {
          status: "in_progress",
          updatedAt: now,
        });
      }
    }

    return { sessionId, callId };
  },
});

/**
 * End a Pitch Arena session. Marks call completed, schedules CRM sync.
 */
export const endSession = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    sessionId: v.id("pitchArenaSessions"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const now = Date.now();

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") return;

    await ctx.db.patch(args.sessionId, {
      status: "completed",
      completedAt: now,
    });

    // Update the linked phone call
    if (session.callId) {
      const call = await ctx.db.get(session.callId);
      if (call && call.status === "in_progress") {
        const duration = Math.round((now - call.startedAt) / 1000);
        await ctx.db.patch(session.callId, {
          status: "completed",
          duration,
          endedAt: now,
        });
      }

      // Schedule CRM sync
      await ctx.scheduler.runAfter(
        0,
        internal.pitchArena.actions.syncSessionToCrm,
        { sessionId: args.sessionId }
      );
    }
  },
});

/**
 * Cancel a Pitch Arena session (call failed or user cancelled).
 */
export const cancelSession = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    sessionId: v.id("pitchArenaSessions"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "active") return;

    await ctx.db.patch(args.sessionId, {
      status: "cancelled",
      completedAt: Date.now(),
    });

    if (session.callId) {
      await ctx.db.patch(session.callId, {
        status: "failed",
        endedAt: Date.now(),
      });
    }
  },
});

/**
 * Trigger pitch generation (called from API route, schedules the internal action).
 */
export const triggerPitchGeneration = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    sessionId: v.id("pitchArenaSessions"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    await ctx.scheduler.runAfter(
      0,
      internal.pitchArena.actions.generatePitch,
      { sessionId: args.sessionId }
    );
  },
});

/**
 * Save a generated pitch to the session.
 */
export const savePitch = internalMutation({
  args: {
    sessionId: v.id("pitchArenaSessions"),
    pitch: v.string(),
    transcriptSnapshotLength: v.number(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return;

    const existing = session.generatedPitches ?? [];
    await ctx.db.patch(args.sessionId, {
      generatedPitches: [
        ...existing,
        {
          pitch: args.pitch,
          generatedAt: Date.now(),
          transcriptSnapshotLength: args.transcriptSnapshotLength,
        },
      ],
    });
  },
});
