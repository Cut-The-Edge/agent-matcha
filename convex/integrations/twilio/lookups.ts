// @ts-nocheck
/**
 * Twilio Lookup Queries
 *
 * Internal queries used by the Twilio webhook handler to find
 * members by their WhatsApp ID or phone number.
 */

import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

/**
 * Find a member by their WhatsApp ID (e.g., "whatsapp:+1234567890").
 */
export const findMemberByWhatsApp = internalQuery({
  args: {
    whatsappId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("members")
      .withIndex("by_whatsappId", (q) => q.eq("whatsappId", args.whatsappId))
      .first();
  },
});

/**
 * Find a member by their phone number (e.g., "+1234567890").
 */
export const findMemberByPhone = internalQuery({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("members")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

/**
 * Find a member by their Convex ID.
 */
export const findMemberById = internalQuery({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.memberId);
  },
});
