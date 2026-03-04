// @ts-nocheck
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * Get a paginated call log with optional filters.
 */
export const getCallLog = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(v.string()),
    direction: v.optional(v.union(v.literal("inbound"), v.literal("outbound"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const limit = args.limit ?? 50;

    let calls;
    if (args.status) {
      calls = await ctx.db
        .query("phoneCalls")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    } else {
      calls = await ctx.db
        .query("phoneCalls")
        .withIndex("by_created")
        .order("desc")
        .take(limit);
    }

    // Apply direction filter in memory
    if (args.direction) {
      calls = calls.filter((c) => c.direction === args.direction);
    }

    // Enrich with member names
    return Promise.all(
      calls.map(async (call) => {
        let memberName: string | null = null;
        if (call.memberId) {
          const member = await ctx.db.get(call.memberId);
          if (member) {
            memberName = `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`;
          }
        }
        return { ...call, memberName };
      })
    );
  },
});

/**
 * Get a single call by ID with full transcript segments.
 */
export const getCallById = query({
  args: {
    sessionToken: v.optional(v.string()),
    callId: v.id("phoneCalls"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const call = await ctx.db.get(args.callId);
    if (!call) return null;

    // Get member info
    let member = null;
    if (call.memberId) {
      member = await ctx.db.get(call.memberId);
    }

    // Get transcript segments ordered by timestamp
    const segments = await ctx.db
      .query("callTranscriptSegments")
      .withIndex("by_call", (q) => q.eq("callId", args.callId))
      .order("asc")
      .collect();

    return { ...call, member, segments };
  },
});

/**
 * Get aggregate call metrics for the dashboard.
 */
export const getCallMetrics = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;

    const allCalls = await ctx.db
      .query("phoneCalls")
      .withIndex("by_created")
      .order("desc")
      .collect();

    const callsToday = allCalls.filter((c) => c.createdAt >= oneDayAgo);
    const callsThisWeek = allCalls.filter((c) => c.createdAt >= oneWeekAgo);
    const callsThisMonth = allCalls.filter((c) => c.createdAt >= oneMonthAgo);

    const completedCalls = allCalls.filter((c) => c.status === "completed");
    const avgDuration =
      completedCalls.length > 0
        ? completedCalls.reduce((sum, c) => sum + (c.duration ?? 0), 0) /
          completedCalls.length
        : 0;

    const profilesCreated = allCalls.filter(
      (c) => c.profileAction === "created"
    ).length;
    const profilesUpdated = allCalls.filter(
      (c) => c.profileAction === "updated"
    ).length;
    const transferred = allCalls.filter(
      (c) => c.status === "transferred"
    ).length;
    const transferRate =
      allCalls.length > 0 ? transferred / allCalls.length : 0;

    const smaSynced = allCalls.filter(
      (c) => c.smaSyncStatus === "synced"
    ).length;
    const smaTotal = allCalls.filter((c) => c.smaSyncStatus).length;
    const smaSyncRate = smaTotal > 0 ? smaSynced / smaTotal : 0;

    return {
      callsToday: callsToday.length,
      callsThisWeek: callsThisWeek.length,
      callsThisMonth: callsThisMonth.length,
      totalCalls: allCalls.length,
      avgDuration: Math.round(avgDuration),
      profilesCreated,
      profilesUpdated,
      transferRate,
      smaSyncRate,
    };
  },
});

/**
 * Get currently active calls (real-time subscription for live indicator).
 */
export const getActiveCalls = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const activeCalls = await ctx.db
      .query("phoneCalls")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    return Promise.all(
      activeCalls.map(async (call) => {
        let memberName: string | null = null;
        if (call.memberId) {
          const member = await ctx.db.get(call.memberId);
          if (member) {
            memberName = `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`;
          }
        }
        return { ...call, memberName };
      })
    );
  },
});

/**
 * Look up a member by phone (internal, used by HTTP endpoint).
 */
export const lookupMemberByPhone = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("members")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
    return member;
  },
});

/**
 * Get a call by ID (internal, used by actions).
 */
export const getCallInternal = internalQuery({
  args: { callId: v.id("phoneCalls") },
  handler: async (ctx, args) => {
    return ctx.db.get(args.callId);
  },
});
