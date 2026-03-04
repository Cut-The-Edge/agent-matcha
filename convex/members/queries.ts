// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * List all members with optional filters (status, tier, search by name/phone/email).
 * Supports pagination via paginationOpts.
 */
export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("recalibrating")
      )
    ),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 200;

    let membersQuery;

    if (args.status) {
      membersQuery = ctx.db
        .query("members")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      membersQuery = ctx.db.query("members");
    }

    let members = await membersQuery.collect();

    // Apply tier filter in memory if provided
    if (args.tier) {
      members = members.filter((m) => m.tier === args.tier);
    }

    // Apply search filter in memory (name, phone, email)
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      members = members.filter((m) => {
        const fullName = `${m.firstName} ${m.lastName ?? ""}`.toLowerCase();
        const phone = (m.phone ?? "").toLowerCase();
        const email = (m.email ?? "").toLowerCase();
        return (
          fullName.includes(searchLower) ||
          phone.includes(searchLower) ||
          email.includes(searchLower)
        );
      });
    }

    // Apply limit
    members = members.slice(0, limit);

    // Enrich with latest match status
    const enriched = await Promise.all(
      members.map(async (member) => {
        const matchAsA = await ctx.db
          .query("matches")
          .withIndex("by_memberA", (q) => q.eq("memberAId", member._id))
          .order("desc")
          .first();
        const matchAsB = await ctx.db
          .query("matches")
          .withIndex("by_memberB", (q) => q.eq("memberBId", member._id))
          .order("desc")
          .first();

        // Pick the most recent match
        let latestMatch = null;
        if (matchAsA && matchAsB) {
          latestMatch =
            matchAsA.createdAt >= matchAsB.createdAt ? matchAsA : matchAsB;
        } else {
          latestMatch = matchAsA ?? matchAsB;
        }

        if (!latestMatch) return { ...member, latestMatchStatus: null, latestMatchPartner: null };

        // Resolve partner name
        const partnerId =
          latestMatch.memberAId === member._id
            ? latestMatch.memberBId
            : latestMatch.memberAId;
        const partner = await ctx.db.get(partnerId);

        return {
          ...member,
          latestMatchStatus: latestMatch.status,
          latestMatchPartner: partner
            ? `${partner.firstName}${partner.lastName ? ` ${partner.lastName}` : ""}`
            : null,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single member by ID.
 */
export const get = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      return null;
    }
    return member;
  },
});

/**
 * Get a member by their SmartMatchApp ID.
 */
export const getBySmaId = query({
  args: {
    sessionToken: v.optional(v.string()),
    smaId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaId))
      .first();
  },
});

/**
 * Lookup member by phone number (for WhatsApp matching).
 */
export const getByPhone = query({
  args: {
    sessionToken: v.optional(v.string()),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db
      .query("members")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
  },
});

/**
 * Lookup member by email.
 */
export const getByEmail = query({
  args: {
    sessionToken: v.optional(v.string()),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

/**
 * List members in "recalibrating" status, enriched with rejection details.
 * Used by the Recalibration dashboard page.
 */
export const listRecalibrating = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "recalibrating"))
      .collect();

    const enriched = await Promise.all(
      members.map(async (member) => {
        const feedbackRecords = await ctx.db
          .query("feedback")
          .withIndex("by_member", (q) => q.eq("memberId", member._id))
          .collect();

        const rejections = feedbackRecords.filter(
          (f) => f.decision === "not_interested"
        );

        // Most recent rejection timestamp
        const lastRejectionAt =
          rejections.length > 0
            ? Math.max(...rejections.map((r) => r.createdAt))
            : null;

        // Most common rejection category
        let topRejectionReason: string | null = null;
        const categoryCounts: Record<string, number> = {};
        for (const r of rejections) {
          if (r.categories) {
            for (const cat of r.categories) {
              categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
            }
          }
        }
        const entries = Object.entries(categoryCounts);
        if (entries.length > 0) {
          entries.sort((a, b) => b[1] - a[1]);
          topRejectionReason = entries[0][0];
        }

        return {
          ...member,
          lastRejectionAt,
          topRejectionReason,
        };
      })
    );

    // Sort by rejectionCount descending
    enriched.sort((a, b) => b.rejectionCount - a.rejectionCount);

    return enriched;
  },
});

/**
 * Return aggregate stats: counts by status, counts by tier, total active.
 */
export const getStats = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMembers = await ctx.db.query("members").collect();

    const byStatus: Record<string, number> = {
      active: 0,
      paused: 0,
      recalibrating: 0,
    };

    const byTier: Record<string, number> = {
      free: 0,
      member: 0,
      vip: 0,
    };

    for (const m of allMembers) {
      byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
      byTier[m.tier] = (byTier[m.tier] ?? 0) + 1;
    }

    return {
      total: allMembers.length,
      totalActive: byStatus.active,
      byStatus,
      byTier,
    };
  },
});
