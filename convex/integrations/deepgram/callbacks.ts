// @ts-nocheck
/**
 * Deepgram Callbacks
 *
 * Internal mutations for logging voice messages and updating transcription results.
 * These bridge the httpAction → mutation → scheduled action pattern:
 *
 * 1. logMediaAndScheduleTranscription — called by webhook, inserts message + schedules transcription
 * 2. updateTranscription — patches message with successful transcription text
 * 3. markTranscriptionFailed — patches message with error string
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Insert a whatsappMessages record for the voice note and schedule
 * the async Deepgram transcription action.
 *
 * Called from the Twilio webhook httpAction. Returns immediately so
 * the webhook can respond 200 to Twilio without waiting for transcription.
 */
export const logMediaAndScheduleTranscription = internalMutation({
  args: {
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    mediaUrl: v.string(),
    mediaContentType: v.string(),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Insert the inbound media message record
    const messageId = await ctx.db.insert("whatsappMessages", {
      matchId: args.matchId,
      memberId: args.memberId,
      direction: "inbound",
      messageType: "media",
      content: "[voice note]",
      twilioSid: args.twilioSid,
      mediaUrl: args.mediaUrl,
      mediaContentType: args.mediaContentType,
      status: "delivered",
      createdAt: Date.now(),
    });

    // Schedule the async transcription action
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.deepgram.transcribe.transcribeAndRoute,
      {
        memberId: args.memberId,
        mediaUrl: args.mediaUrl,
        mediaContentType: args.mediaContentType,
        twilioSid: args.twilioSid,
        whatsappMessageId: messageId,
      }
    );

    return messageId;
  },
});

/**
 * Patch a whatsappMessages record with the successful transcription text,
 * plus optional Deepgram metadata (duration, confidence).
 */
export const updateTranscription = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    transcription: v.string(),
    audioDuration: v.optional(v.number()),
    transcriptionConfidence: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      transcription: args.transcription,
      ...(args.audioDuration !== undefined && { audioDuration: args.audioDuration }),
      ...(args.transcriptionConfidence !== undefined && {
        transcriptionConfidence: args.transcriptionConfidence,
      }),
    });
  },
});

/**
 * Patch a whatsappMessages record with a transcription error string.
 */
export const markTranscriptionFailed = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      transcription: `[FAILED] ${args.error}`,
    });
  },
});

/**
 * Flag a voice note for human review (low confidence transcription).
 * Patches the message record and inserts an audit log entry.
 */
export const flagForReview = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    reason: v.union(v.literal("low_confidence"), v.literal("long_note")),
  },
  handler: async (ctx, args) => {
    const exists = await ctx.db.get(args.messageId);
    if (!exists) {
      console.error(
        `[deepgram] flagForReview: message ${args.messageId} not found, cannot flag as ${args.reason}`
      );
      return;
    }

    await ctx.db.patch(args.messageId, {
      reviewFlag: args.reason,
    });

    await ctx.db.insert("auditLogs", {
      action: "voice_note_flagged",
      resource: "whatsappMessages",
      resourceId: args.messageId,
      details: `Voice note flagged: ${args.reason}`,
      createdAt: Date.now(),
    });
  },
});

/**
 * Store an AI-generated summary for a long voice note transcription.
 */
export const updateTranscriptionSummary = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      transcriptionSummary: args.summary,
    });
  },
});

/**
 * Add a voice note to an existing collecting batch or create a new one.
 * Schedules (or reschedules) a flush after 8 seconds.
 *
 * The 8s window allows rapid-fire voice notes to be grouped before routing,
 * while keeping latency acceptable (transcription itself takes 3-5s).
 */
export const addToBatchOrRoute = internalMutation({
  args: {
    memberId: v.id("members"),
    messageId: v.id("whatsappMessages"),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const BATCH_WINDOW_MS = 8000;

    // Look for an existing "collecting" batch for this member
    // (Convex serializable transactions guarantee at most one per member)
    const existingBatch = await ctx.db
      .query("voiceNoteBatches")
      .withIndex("by_member_status", (q) =>
        q.eq("memberId", args.memberId).eq("status", "collecting")
      )
      .first();

    if (existingBatch) {
      // Cancel the old flush timer (may have already fired under load)
      if (existingBatch.schedulerJobId) {
        try {
          await ctx.scheduler.cancel(existingBatch.schedulerJobId);
        } catch {
          // Job may have already fired — the new schedule will handle routing
        }
      }

      // Append this message and schedule a new flush
      const jobId = await ctx.scheduler.runAfter(
        BATCH_WINDOW_MS,
        internal.integrations.deepgram.callbacks.flushVoiceNoteBatch,
        { batchId: existingBatch._id, twilioSid: args.twilioSid }
      );

      await ctx.db.patch(existingBatch._id, {
        messageIds: [...existingBatch.messageIds, args.messageId],
        schedulerJobId: jobId,
      });
    } else {
      // Insert the batch first so we have a real ID for scheduling
      const batchId = await ctx.db.insert("voiceNoteBatches", {
        memberId: args.memberId,
        messageIds: [args.messageId],
        status: "collecting",
        createdAt: Date.now(),
      });

      const jobId = await ctx.scheduler.runAfter(
        BATCH_WINDOW_MS,
        internal.integrations.deepgram.callbacks.flushVoiceNoteBatch,
        { batchId, twilioSid: args.twilioSid }
      );

      await ctx.db.patch(batchId, { schedulerJobId: jobId });
    }
  },
});

/**
 * Flush a voice note batch: concatenate all transcriptions and route
 * the combined text into the flow engine.
 */
export const flushVoiceNoteBatch = internalMutation({
  args: {
    batchId: v.id("voiceNoteBatches"),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const batch = await ctx.db.get(args.batchId);
    if (!batch) {
      console.error(
        `[deepgram] flushVoiceNoteBatch called with non-existent batchId: ${args.batchId}`
      );
      return;
    }
    if (batch.status !== "collecting") {
      // Idempotency guard — batch already flushed
      return;
    }

    // Load all messages in the batch
    const texts: string[] = [];
    let failedCount = 0;
    for (const msgId of batch.messageIds) {
      const msg = await ctx.db.get(msgId);
      if (!msg) {
        console.error(`[deepgram] Batch ${args.batchId}: message ${msgId} not found, skipping`);
        continue;
      }
      // Prefer summary over full transcription for long notes
      const text = msg.transcriptionSummary || msg.transcription;
      if (!text || text.startsWith("[FAILED]")) {
        failedCount++;
        continue;
      }
      texts.push(text);
    }

    const combinedText = texts.join(" ");

    if (combinedText.trim().length > 0) {
      // Route the combined text into the flow engine
      await ctx.runMutation(
        internal.engine.transitions.handleMemberResponse,
        {
          memberId: batch.memberId,
          response: combinedText,
          twilioSid: args.twilioSid,
        }
      );
    } else {
      console.error(
        `[deepgram] Batch ${args.batchId} produced no usable text ` +
        `(${batch.messageIds.length} messages, ${failedCount} failed)`
      );
    }

    // Mark batch as routed
    await ctx.db.patch(args.batchId, {
      status: "routed",
      routedAt: Date.now(),
      schedulerJobId: undefined,
    });
  },
});
