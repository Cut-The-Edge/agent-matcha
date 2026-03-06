// @ts-nocheck
import { query, internalQuery } from "../_generated/server";
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

    return members;
  },
});

/**
 * Get all SMA introductions for a member by their SMA ID.
 */
export const getIntroductions = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberSmaId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db
      .query("smaIntroductions")
      .withIndex("by_member", (q) => q.eq("memberSmaId", args.memberSmaId))
      .collect();
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
 * Find member SMA IDs affected by a given SMA match ID.
 * Checks smaIntroductions first, falls back to the matches table.
 */
export const getMemberSmaIdsByMatchId = internalQuery({
  args: { smaMatchId: v.number() },
  handler: async (ctx, args) => {
    // 1. Check smaIntroductions table
    const intros = await ctx.db
      .query("smaIntroductions")
      .withIndex("by_smaMatchId", (q) => q.eq("smaMatchId", args.smaMatchId))
      .collect();
    if (intros.length > 0) {
      return [...new Set(intros.map((i) => i.memberSmaId))];
    }

    // 2. Fallback: check internal matches table by smaIntroId
    const match = await ctx.db
      .query("matches")
      .withIndex("by_smaIntroId", (q) => q.eq("smaIntroId", String(args.smaMatchId)))
      .first();
    if (match) {
      const smaIds: string[] = [];
      const memberA = await ctx.db.get(match.memberAId);
      const memberB = await ctx.db.get(match.memberBId);
      if (memberA?.smaId) smaIds.push(memberA.smaId);
      if (memberB?.smaId) smaIds.push(memberB.smaId);
      return smaIds;
    }

    return [];
  },
});

/**
 * Get a single member by ID (no auth required — internal use only).
 */
export const getInternal = internalQuery({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.memberId);
  },
});

/**
 * List all members (no auth required — internal use only).
 * Used by syncAllMembers to iterate over every member.
 */
export const listAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("members").collect();
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
 * Look up a partner's display name by SMA ID.
 * Checks the members table first, then falls back to cached partnerName
 * in smaIntroductions. Returns null if no name found.
 * Used to avoid redundant SMA API calls for partner name resolution.
 */
export const lookupPartnerNameInternal = internalQuery({
  args: { smaId: v.string() },
  handler: async (ctx, args) => {
    // 1. Check members table (most reliable source)
    const member = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaId))
      .first();
    if (member && member.firstName && member.firstName !== "Unknown") {
      return `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`;
    }

    // 2. Fall back to cached partner name from any smaIntroductions record
    const intro = await ctx.db
      .query("smaIntroductions")
      .withIndex("by_partnerSmaId", (q) => q.eq("partnerSmaId", args.smaId))
      .first();
    if (intro?.partnerName) {
      return intro.partnerName;
    }

    return null;
  },
});

/**
 * Get a member by their SmartMatchApp ID (no auth required — internal use only).
 */
export const getBySmaIdInternal = internalQuery({
  args: {
    smaId: v.string(),
  },
  handler: async (ctx, args) => {
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
          topRejectionReason: member.recalibrationSummary?.keyPatterns?.[0] || topRejectionReason,
          recalibrationSummary: member.recalibrationSummary?.summary || null,
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

/**
 * Get the current sync-all job status.
 * Returns the most recent running or recently completed job.
 */
export const getSyncStatus = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Check for a running job first
    const running = await ctx.db
      .query("syncJobs")
      .withIndex("by_type_status", (q) => q.eq("type", "sync_all_members").eq("status", "running"))
      .first();
    if (running) return running;

    // Return most recent completed/failed job (within last 5 minutes)
    const recent = await ctx.db
      .query("syncJobs")
      .order("desc")
      .filter((q) => q.eq(q.field("type"), "sync_all_members"))
      .first();

    if (recent && recent.completedAt && Date.now() - recent.completedAt < 5 * 60 * 1000) {
      return recent;
    }

    return null;
  },
});
