// @ts-nocheck
import { internalAction, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";

/**
 * Find calls that are stuck in "in_progress" for over 1 hour.
 * These are likely crashed calls that never got a call-ended event.
 */
export const findOrphanedCalls = internalQuery({
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    const inProgressCalls = await ctx.db
      .query("phoneCalls")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    // Filter to calls older than 1 hour
    return inProgressCalls.filter((call) => call.startedAt < oneHourAgo);
  },
});

/**
 * Recover orphaned calls — mark them as failed and trigger AI summary
 * to extract whatever data we can from the transcript segments.
 */
export const recoverOrphanedCalls = internalAction({
  handler: async (ctx) => {
    const orphaned = await ctx.runQuery(
      internal.voice.recovery.findOrphanedCalls
    );

    for (const call of orphaned) {
      console.log(`Recovering orphaned call: ${call._id}`);

      // Get transcript segments that were streamed in real-time
      const segments = await ctx.runQuery(
        internal.voice.recovery.getSegmentsForCall,
        { callId: call._id }
      );

      // Build transcript from segments
      const transcript = segments.map((seg: any) => ({
        speaker: seg.speaker,
        text: seg.text,
        timestamp: seg.timestamp,
      }));

      // Mark call as failed with whatever transcript we have
      const duration = Math.round((Date.now() - call.startedAt) / 1000);
      await ctx.runMutation(internal.voice.mutations.updateCall, {
        callId: call._id,
        status: "failed",
        duration,
        transcript: transcript.length > 0 ? transcript : undefined,
        qualityFlags: ["crashed"],
      });

      // Trigger AI summary to extract profile data from transcript
      if (transcript.length > 0) {
        await ctx.scheduler.runAfter(
          0,
          internal.voice.actions.generateSummary,
          { callId: call._id }
        );
      }
    }

    if (orphaned.length > 0) {
      console.log(`Recovered ${orphaned.length} orphaned calls`);
    }
  },
});

/**
 * Get transcript segments for a call (internal).
 */
export const getSegmentsForCall = internalQuery({
  args: { callId: v.id("phoneCalls") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("callTranscriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();
  },
});
