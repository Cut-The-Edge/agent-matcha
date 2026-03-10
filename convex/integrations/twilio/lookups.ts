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
 * Tries exact index match first, then falls back to digits-only comparison
 * to handle CRM formatting differences (spaces, dashes, parentheses, etc.).
 */
export const findMemberByPhone = internalQuery({
  args: {
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Try exact index match
    const exact = await ctx.db
      .query("members")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
    if (exact) return exact;

    // 2. Fallback: strip to digits-only and scan all members
    // Compare last 10 digits to handle +1 country code mismatches
    // e.g. stored "7542026432" matches incoming "+17542026432"
    const digits = args.phone.replace(/\D/g, "");
    if (digits.length < 7) return null;
    const last10 = digits.slice(-10);

    const all = await ctx.db.query("members").collect();
    return all.find((m) => {
      if (!m.phone) return false;
      const memberDigits = m.phone.replace(/\D/g, "");
      return memberDigits === digits || memberDigits.slice(-10) === last10;
    }) ?? null;
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
