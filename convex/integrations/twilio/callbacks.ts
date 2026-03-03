// @ts-nocheck
/**
 * Twilio Callbacks
 *
 * Internal mutations called by Twilio send actions to update
 * whatsappMessages records with Twilio SIDs and delivery status.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

/**
 * Update a whatsappMessages record with the Twilio message SID
 * after a successful send.
 */
export const updateMessageSid = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    twilioSid: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      twilioSid: args.twilioSid,
    });
  },
});

/**
 * Mark a whatsappMessages record as failed when a Twilio send errors.
 */
export const markMessageFailed = internalMutation({
  args: {
    messageId: v.id("whatsappMessages"),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, {
      status: "failed",
    });
  },
});
