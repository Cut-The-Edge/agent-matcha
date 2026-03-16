// @ts-nocheck
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";
import { getMissingFields } from "../dataRequests/helpers";

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
        return { ...call, memberName, sandbox: call.sandbox ?? false };
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

    return { ...call, member, segments, sandbox: call.sandbox ?? false };
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
    // Normalize input to last 10 digits for comparison
    const inputDigits = args.phone.replace(/\D/g, "");
    const inputNorm = inputDigits.length >= 10 ? inputDigits.slice(-10) : inputDigits;

    // 1. Try exact index match
    const exact = await ctx.db
      .query("members")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();
    if (exact) return exact;

    if (inputNorm.length < 7) return null;

    // 2. Fallback: normalize to last 10 digits and scan all members
    // Also checks profileData.phone (from SMA sync) as a secondary source
    const all = await ctx.db.query("members").collect();
    return all.find((m) => {
      // Check primary phone field
      if (m.phone) {
        const memberDigits = m.phone.replace(/\D/g, "");
        const memberNorm = memberDigits.length >= 10 ? memberDigits.slice(-10) : memberDigits;
        if (memberNorm === inputNorm) return true;
      }
      // Check profileData.phone (SMA-synced phone)
      const profilePhone = (m.profileData as Record<string, unknown> | undefined)?.phone;
      if (profilePhone && typeof profilePhone === "string") {
        const profileDigits = profilePhone.replace(/\D/g, "");
        const profileNorm = profileDigits.length >= 10 ? profileDigits.slice(-10) : profileDigits;
        if (profileNorm === inputNorm) return true;
      }
      return false;
    }) ?? null;
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

/**
 * Get full member context for the voice agent's system prompt.
 *
 * Gathers: full member record + latest completed call's extractedData
 * (previous intake answers) so the agent can skip re-asking known info.
 */
export const getMemberContext = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) return null;

    // Get the latest completed call's extractedData for this member
    const latestCall = await ctx.db
      .query("phoneCalls")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("desc")
      .first();

    const previousIntake =
      latestCall?.status === "completed" && latestCall.extractedData
        ? latestCall.extractedData
        : null;

    // Return conversation-useful fields only (exclude PII like email/phone/smaId/timestamps)
    return {
      _id: member._id,
      firstName: member.firstName,
      lastName: member.lastName,
      tier: member.tier,
      status: member.status,
      profileComplete: member.profileComplete,
      matchmakerNotes: member.matchmakerNotes,
      rejectionCount: member.rejectionCount,
      recalibrationSummary: member.recalibrationSummary,
      previousIntake,
    };
  },
});

/**
 * Get full member context including SMA data for the voice agent.
 * Extends getMemberContext with smaId and profileData.
 */
export const getMemberFullContext = internalQuery({
  args: { memberId: v.id("members") },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) return null;

    const latestCall = await ctx.db
      .query("phoneCalls")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("desc")
      .first();

    const previousIntake =
      latestCall?.status === "completed" && latestCall.extractedData
        ? latestCall.extractedData
        : null;

    // Check for pending data request
    const pendingDataRequest = await ctx.db
      .query("dataRequests")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    return {
      _id: member._id,
      firstName: member.firstName,
      lastName: member.lastName,
      tier: member.tier,
      status: member.status,
      profileComplete: member.profileComplete,
      matchmakerNotes: member.matchmakerNotes,
      rejectionCount: member.rejectionCount,
      recalibrationSummary: member.recalibrationSummary,
      previousIntake,
      smaId: member.smaId,
      smaProfile: member.profileData ?? null,
      missingFormFields: getMissingFields(member),
      hasDataRequestPending: !!pendingDataRequest,
    };
  },
});
