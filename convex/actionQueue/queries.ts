// @ts-nocheck
/**
 * Action Queue Queries
 *
 * List, filter, and count action queue items for the dashboard.
 * Enriches items with member names, payment amounts, and match details.
 */

import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

// ============================================================================
// list — List action items with optional status filter, enriched
// ============================================================================

export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("in_progress"),
        v.literal("resolved"),
        v.literal("expired"),
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 100;

    let items;
    if (args.status) {
      items = await ctx.db
        .query("actionQueue")
        .withIndex("by_status", (q) => q.eq("status", args.status))
        .collect();
    } else {
      items = await ctx.db
        .query("actionQueue")
        .withIndex("by_createdAt")
        .order("desc")
        .collect();
    }

    // Sort by priority (urgent first), then by createdAt desc
    const PRIORITY_ORDER: Record<string, number> = {
      urgent: 0,
      high: 1,
      medium: 2,
      low: 3,
    };

    const sorted = args.status
      ? items
          .sort((a, b) => {
            const pDiff = (PRIORITY_ORDER[a.priority] ?? 4) - (PRIORITY_ORDER[b.priority] ?? 4);
            if (pDiff !== 0) return pDiff;
            return b.createdAt - a.createdAt;
          })
          .slice(0, limit)
      : items.slice(0, limit);

    // Enrich each item
    const enriched = await Promise.all(
      sorted.map(async (item) => {
        const member = await ctx.db.get(item.memberId);
        const memberName = member
          ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
          : "Unknown";

        let matchPartnerName = "";
        let matchStatus = "";
        if (item.matchId) {
          const match = await ctx.db.get(item.matchId);
          if (match) {
            matchStatus = match.status;
            const partnerId =
              match.memberAId === item.memberId
                ? match.memberBId
                : match.memberAId;
            const partner = await ctx.db.get(partnerId);
            matchPartnerName = partner
              ? `${partner.firstName}${partner.lastName ? ` ${partner.lastName}` : ""}`
              : "Unknown";
          }
        }

        // Look up payment amount
        let paymentAmount: number | null = null;
        if (item.matchId) {
          const payment = await ctx.db
            .query("payments")
            .withIndex("by_match", (q) => q.eq("matchId", item.matchId))
            .first();
          if (payment) {
            paymentAmount = payment.amount;
          }
        }

        return {
          ...item,
          memberName,
          memberPhone: member?.phone ?? null,
          matchPartnerName,
          matchStatus,
          paymentAmount,
        };
      })
    );

    return enriched;
  },
});

// ============================================================================
// getById — Full context for a single action item
// ============================================================================

export const getById = query({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) return null;

    // Enrich with member details
    const member = await ctx.db.get(item.memberId);

    // Enrich with match + partner details
    let matchDetails = null;
    if (item.matchId) {
      const match = await ctx.db.get(item.matchId);
      if (match) {
        const partnerId =
          match.memberAId === item.memberId
            ? match.memberBId
            : match.memberAId;
        const partner = await ctx.db.get(partnerId);

        matchDetails = {
          matchId: match._id,
          status: match.status,
          responseType: match.responseType,
          partnerName: partner
            ? `${partner.firstName}${partner.lastName ? ` ${partner.lastName}` : ""}`
            : "Unknown",
          partnerPhone: partner?.phone ?? null,
        };
      }
    }

    // Look up payment
    let paymentDetails = null;
    if (item.matchId) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_match", (q) => q.eq("matchId", item.matchId))
        .collect();
      if (payments.length > 0) {
        paymentDetails = payments.map((p) => ({
          paymentId: p._id,
          amount: p.amount,
          phase: p.phase,
          status: p.status,
        }));
      }
    }

    // Flow instance status
    let flowStatus = null;
    if (item.flowInstanceId) {
      const instance = await ctx.db.get(item.flowInstanceId);
      if (instance) {
        flowStatus = instance.status;
      }
    }

    return {
      ...item,
      memberName: member
        ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
        : "Unknown",
      memberPhone: member?.phone ?? null,
      memberTier: member?.tier ?? null,
      matchDetails,
      paymentDetails,
      flowStatus,
    };
  },
});

// ============================================================================
// getCounts — Count by status for metrics cards and tab badges
// ============================================================================

export const getCounts = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const [pendingItems, inProgressItems, resolvedItems, expiredItems] = await Promise.all([
      ctx.db.query("actionQueue").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
      ctx.db.query("actionQueue").withIndex("by_status", (q) => q.eq("status", "in_progress")).collect(),
      ctx.db.query("actionQueue").withIndex("by_status", (q) => q.eq("status", "resolved")).collect(),
      ctx.db.query("actionQueue").withIndex("by_status", (q) => q.eq("status", "expired")).collect(),
    ]);

    const pending = pendingItems.length;
    const inProgress = inProgressItems.length;
    const resolved = resolvedItems.length;
    const expired = expiredItems.length;

    return { total: pending + inProgress + resolved + expired, pending, inProgress, resolved, expired };
  },
});

// ============================================================================
// countPending — Simple pending count for sidebar badge
// ============================================================================

export const countPending = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const pending = await ctx.db
      .query("actionQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const inProgress = await ctx.db
      .query("actionQueue")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    const count = pending.length + inProgress.length;
    return count || null;
  },
});

// ============================================================================
// getByIdInternal — No auth, for use by notify actions and crons
// ============================================================================

export const getByIdInternal = internalQuery({
  args: {
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.actionItemId);
  },
});

// ============================================================================
// listStaleItems — Pending items older than threshold (for cron)
// ============================================================================

export const listStaleItems = internalQuery({
  args: {
    maxAge: v.number(), // milliseconds
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.maxAge;
    const limit = args.limit ?? 50;

    const items = await ctx.db
      .query("actionQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return items
      .filter((item) => item.createdAt < cutoff)
      .slice(0, limit);
  },
});
