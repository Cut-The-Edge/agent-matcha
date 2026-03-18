// @ts-nocheck
/**
 * Escalation Queries
 *
 * List, filter, and count escalations for the dashboard.
 */

import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

// ============================================================================
// list — List escalations with optional status filter
// ============================================================================

export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("resolved"),
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 100;

    let escalations;
    if (args.status) {
      escalations = await ctx.db
        .query("escalations")
        .withIndex("by_status", (q) => q.eq("status", args.status))
        .collect();
    } else {
      escalations = await ctx.db
        .query("escalations")
        .withIndex("by_created")
        .order("desc")
        .collect();
    }

    // Sort by createdAt desc and limit
    const sorted = args.status
      ? escalations.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
      : escalations.slice(0, limit);

    // Enrich with member phone for quick action
    const enriched = await Promise.all(
      sorted.map(async (esc) => {
        const member = await ctx.db.get(esc.memberId);
        return {
          ...esc,
          memberPhone: member?.phone ?? null,
          memberTier: member?.tier ?? null,
        };
      })
    );

    return enriched;
  },
});

// ============================================================================
// getById — Get a single escalation by ID
// ============================================================================

export const getById = query({
  args: {
    sessionToken: v.optional(v.string()),
    escalationId: v.id("escalations"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) return null;

    const member = await ctx.db.get(escalation.memberId);

    let matchDetails = null;
    if (escalation.matchId) {
      const match = await ctx.db.get(escalation.matchId);
      if (match) {
        const otherMemberId =
          match.memberAId === escalation.memberId
            ? match.memberBId
            : match.memberAId;
        const otherMember = await ctx.db.get(otherMemberId);
        matchDetails = {
          matchId: match._id,
          status: match.status,
          responseType: match.responseType,
          otherMemberName: otherMember
            ? `${otherMember.firstName}${otherMember.lastName ? ` ${otherMember.lastName}` : ""}`
            : "Unknown",
        };
      }
    }

    return {
      ...escalation,
      memberPhone: member?.phone ?? null,
      memberTier: member?.tier ?? null,
      matchDetails,
    };
  },
});

// ============================================================================
// getCounts — Get count of escalations by status
// ============================================================================

export const getCounts = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const all = await ctx.db.query("escalations").collect();

    let pending = 0;
    let inProgress = 0;
    let resolved = 0;

    for (const esc of all) {
      if (esc.status === "pending") pending++;
      else if (esc.status === "in_progress") inProgress++;
      else if (esc.status === "resolved") resolved++;
    }

    return {
      total: all.length,
      pending,
      inProgress,
      resolved,
    };
  },
});

// ============================================================================
// getByIdInternal — Internal query (no auth) for use by notification actions
// ============================================================================

export const getByIdInternal = internalQuery({
  args: {
    escalationId: v.id("escalations"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.escalationId);
  },
});

// ============================================================================
// listByMember — All escalations for a specific member
// ============================================================================

export const listByMember = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const escalations = await ctx.db
      .query("escalations")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();

    return escalations.sort((a, b) => b.createdAt - a.createdAt);
  },
});
