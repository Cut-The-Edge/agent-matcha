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
 * Patch a whatsappMessages record with the successful transcription text.
 */
export const updateTranscription = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    transcription: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      transcription: args.transcription,
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
