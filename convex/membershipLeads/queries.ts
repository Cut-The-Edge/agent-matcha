// @ts-nocheck
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

// Safety limit for list queries
const MAX_LEADS = 500;

// ── List leads ──────────────────────────────────────────────────────

export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("approved"),
        v.literal("denied"),
        v.literal("expired"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    let leads;
    if (args.status) {
      leads = await ctx.db
        .query("membershipLeads")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(MAX_LEADS);
    } else {
      leads = await ctx.db
        .query("membershipLeads")
        .order("desc")
        .take(MAX_LEADS);
    }

    // Enrich with member and call data
    const enriched = await Promise.all(
      leads.map(async (lead) => {
        const member = lead.memberId
          ? await ctx.db.get(lead.memberId)
          : null;
        const call = lead.callId
          ? await ctx.db.get(lead.callId)
          : null;

        const now = Date.now();
        const msRemaining = lead.slaDeadline - now;
        const daysRemaining =
          lead.status === "pending" && msRemaining > 0
            ? Math.ceil(msRemaining / (1000 * 60 * 60 * 24))
            : 0;

        return {
          ...lead,
          memberName: member
            ? `${member.firstName}${member.lastName ? " " + member.lastName : ""}`
            : null,
          memberTier: member?.tier,
          callDate: call?.startedAt,
          daysRemaining,
        };
      })
    );

    return enriched;
  },
});

// ── Count pending (for sidebar badge) ───────────────────────────────

export const countPending = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const pending = await ctx.db
      .query("membershipLeads")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(1000);

    return pending.length;
  },
});

// ── Metrics (for dashboard cards) ───────────────────────────────────

export const metrics = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Count pending
    const pending = await ctx.db
      .query("membershipLeads")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(1000);

    // This month boundaries
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    // Get approved this month
    const approved = await ctx.db
      .query("membershipLeads")
      .withIndex("by_status", (q) => q.eq("status", "approved"))
      .take(1000);
    const approvedThisMonth = approved.filter(
      (l) => l.resolvedAt && l.resolvedAt >= monthStart
    ).length;

    // Get denied this month
    const denied = await ctx.db
      .query("membershipLeads")
      .withIndex("by_status", (q) => q.eq("status", "denied"))
      .take(1000);
    const deniedThisMonth = denied.filter(
      (l) => l.resolvedAt && l.resolvedAt >= monthStart
    ).length;

    // Get expired this month
    const expired = await ctx.db
      .query("membershipLeads")
      .withIndex("by_status", (q) => q.eq("status", "expired"))
      .take(1000);
    const expiredThisMonth = expired.filter(
      (l) => l.resolvedAt && l.resolvedAt >= monthStart
    ).length;

    return {
      pendingCount: pending.length,
      approvedThisMonth,
      deniedThisMonth,
      expiredThisMonth,
    };
  },
});

// ── Get single lead ─────────────────────────────────────────────────

export const get = query({
  args: {
    sessionToken: v.optional(v.string()),
    leadId: v.id("membershipLeads"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db.get(args.leadId);
  },
});

// ── Internal get (no auth) ──────────────────────────────────────────

export const getInternal = internalQuery({
  args: { leadId: v.id("membershipLeads") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.leadId);
  },
});
