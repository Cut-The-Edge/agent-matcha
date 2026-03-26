// @ts-nocheck
/**
 * Pitch Arena Queries
 *
 * Reactive queries for live transcript, session state, and member context.
 */

import { v } from "convex/values";
import { query, internalQuery } from "../_generated/server";
import { requireAuth } from "../auth/authz";

/**
 * Get a session by ID with full member/match context and pitches.
 */
export const getSession = query({
  args: {
    sessionToken: v.optional(v.string()),
    sessionId: v.id("pitchArenaSessions"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const member = await ctx.db.get(session.memberId);
    const matchMember = await ctx.db.get(session.matchMemberId);
    const match = session.matchId ? await ctx.db.get(session.matchId) : null;

    return {
      ...session,
      member: member
        ? {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            phone: member.phone,
            tier: member.tier,
            profileData: member.profileData,
            matchmakerNotes: member.matchmakerNotes,
            smaIntroSummary: member.smaIntroSummary,
          }
        : null,
      matchMember: matchMember
        ? {
            _id: matchMember._id,
            firstName: matchMember.firstName,
            lastName: matchMember.lastName,
            phone: matchMember.phone,
            profilePictureUrl: matchMember.profilePictureUrl,
            profileData: matchMember.profileData,
          }
        : null,
      matchStatus: match?.status ?? null,
    };
  },
});

/**
 * Reactive live transcript for a Pitch Arena call.
 * Subscribes to callTranscriptSegments — updates in real time.
 */
export const getLiveTranscript = query({
  args: {
    sessionToken: v.optional(v.string()),
    callId: v.id("phoneCalls"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    return await ctx.db
      .query("callTranscriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
  },
});

/**
 * Get the active Pitch Arena session (if any).
 */
export const getActiveSession = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    return await ctx.db
      .query("pitchArenaSessions")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .first();
  },
});

// ═══ Internal queries (for actions) ═══════════════════════════════════════

export const internalGetSession = internalQuery({
  args: { sessionId: v.id("pitchArenaSessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const internalGetTranscript = internalQuery({
  args: { callId: v.id("phoneCalls") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("callTranscriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .collect();
  },
});
