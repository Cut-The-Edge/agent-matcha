// @ts-nocheck
/**
 * WhatsApp Messaging via Twilio
 *
 * Three send functions used by the flow engine executor:
 *
 * 1. sendTextMessage     — Plain text (MESSAGE nodes)
 * 2. sendNumberedReply   — Text + numbered options (DECISION / FEEDBACK_COLLECT nodes with >3 options)
 * 3. sendButtonMessage   — Interactive quick-reply buttons (DECISION nodes with ≤3 options)
 *
 * All are internalActions because they call the external Twilio API.
 * Each returns the Twilio message SID for tracking.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { createTwilioClient, toWhatsAppFormat } from "./config";

// ============================================================================
// sendTextMessage — Plain text WhatsApp message
// ============================================================================

export const sendTextMessage = internalAction({
  args: {
    to: v.string(),
    body: v.string(),
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
  },
  handler: async (ctx, args) => {
    const twilio = createTwilioClient();

    const result = await twilio.sendMessage(ctx, {
      to: toWhatsAppFormat(args.to),
      body: args.body,
    });

    // Update the whatsappMessages record with the Twilio SID
    if (args.whatsappMessageId && result.sid) {
      await ctx.runMutation(
        internal.integrations.twilio.callbacks.updateMessageSid,
        {
          messageId: args.whatsappMessageId,
          twilioSid: result.sid,
        }
      );
    }

    return { twilioSid: result.sid, status: result.status };
  },
});

// ============================================================================
// sendNumberedReplyMessage — Text + numbered options
// ============================================================================

/**
 * Formats a question with numbered options for WhatsApp.
 * WhatsApp doesn't support list messages via basic Twilio API,
 * so we use numbered replies as the pragmatic approach.
 *
 * Output format:
 *   "What did you think of your match?
 *
 *   1. Interested
 *   2. Not interested
 *   3. Need more time
 *
 *   Reply with a number to choose."
 */
export const sendNumberedReplyMessage = internalAction({
  args: {
    to: v.string(),
    question: v.string(),
    options: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
      })
    ),
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
  },
  handler: async (ctx, args) => {
    const twilio = createTwilioClient();

    // Format numbered options
    const optionsText = args.options
      .map((opt, i) => `${i + 1}. ${opt.label}`)
      .join("\n");

    const body = `${args.question}\n\n${optionsText}\n\nReply with a number to choose.`;

    const result = await twilio.sendMessage(ctx, {
      to: toWhatsAppFormat(args.to),
      body,
    });

    if (args.whatsappMessageId && result.sid) {
      await ctx.runMutation(
        internal.integrations.twilio.callbacks.updateMessageSid,
        {
          messageId: args.whatsappMessageId,
          twilioSid: result.sid,
        }
      );
    }

    return { twilioSid: result.sid, status: result.status };
  },
});

// ============================================================================
// sendButtonMessage — Interactive quick-reply buttons (≤3 options)
// ============================================================================

/**
 * For Phase 1, this falls back to numbered replies.
 * Twilio Content Templates (required for interactive buttons) need
 * pre-approval — we'll add real button support in Phase 2+.
 */
export const sendButtonMessage = internalAction({
  args: {
    to: v.string(),
    question: v.string(),
    options: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
      })
    ),
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
  },
  handler: async (ctx, args) => {
    // Phase 1: Fall back to numbered reply format
    // Phase 2+: Use Twilio Content Templates for real buttons
    const twilio = createTwilioClient();

    const optionsText = args.options
      .map((opt, i) => `${i + 1}. ${opt.label}`)
      .join("\n");

    const body = `${args.question}\n\n${optionsText}\n\nReply with a number to choose.`;

    const result = await twilio.sendMessage(ctx, {
      to: toWhatsAppFormat(args.to),
      body,
    });

    if (args.whatsappMessageId && result.sid) {
      await ctx.runMutation(
        internal.integrations.twilio.callbacks.updateMessageSid,
        {
          messageId: args.whatsappMessageId,
          twilioSid: result.sid,
        }
      );
    }

    return { twilioSid: result.sid, status: result.status };
  },
});
