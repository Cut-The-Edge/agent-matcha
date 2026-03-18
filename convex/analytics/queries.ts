import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * Overview stats for the dashboard:
 * - total members, active members
 * - active matches, pending responses
 * - response rate (computed from match statuses)
 */
export const getOverviewStats = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMembers = await ctx.db.query("members").collect();
    const allMatches = await ctx.db.query("matches").collect();

    const totalMembers = allMembers.length;
    const activeMembers = allMembers.filter((m) => m.status === "active").length;

    const terminalStatuses = new Set([
      "completed",
      "expired",
      "rejected",
      "past",
    ]);

    const pendingStatuses = new Set([
      "active",
    ]);

    const respondedStatuses = new Set([
      "rejected",
      "past",
      "pending",
      "completed",
    ]);

    const activeMatches = allMatches.filter(
      (m) => !terminalStatuses.has(m.status)
    ).length;

    const pendingResponses = allMatches.filter((m) =>
      pendingStatuses.has(m.status)
    ).length;

    const respondedCount = allMatches.filter((m) =>
      respondedStatuses.has(m.status)
    ).length;

    const totalNonPending = allMatches.filter(
      (m) => !pendingStatuses.has(m.status) || respondedStatuses.has(m.status)
    ).length;

    // Response rate = (matches with at least one response) / (total matches that have been sent)
    const sentOrBeyond = allMatches.filter(
      (m) => m.status !== "pending"
    ).length;

    const responseRate =
      sentOrBeyond > 0 ? respondedCount / sentOrBeyond : 0;

    return {
      totalMembers,
      activeMembers,
      totalMatches: allMatches.length,
      activeMatches,
      pendingResponses,
      respondedCount,
      completedMatches: allMatches.filter((m) => m.status === "completed").length,
      responseRate: Math.round(responseRate * 100),
    };
  },
});

/**
 * Count of matches per status.
 */
export const getMatchStatusDistribution = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMatches = await ctx.db.query("matches").collect();

    const distribution: Record<string, number> = {};
    for (const match of allMatches) {
      distribution[match.status] = (distribution[match.status] ?? 0) + 1;
    }

    return {
      total: allMatches.length,
      distribution,
    };
  },
});

/**
 * Count of feedback per category.
 */
export const getFeedbackCategoryDistribution = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allFeedback = await ctx.db.query("feedback").collect();

    const byDecision: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const entry of allFeedback) {
      byDecision[entry.decision] = (byDecision[entry.decision] ?? 0) + 1;

      if (entry.categories) {
        for (const cat of entry.categories) {
          byCategory[cat] = (byCategory[cat] ?? 0) + 1;
        }
      }
    }

    return {
      total: allFeedback.length,
      byDecision,
      byCategory,
    };
  },
});

/**
 * Matches completed per day for the last 30 days.
 * Uses updatedAt timestamp of completed matches to group by day.
 */
export const getResponseTrend = query({
  args: {
    sessionToken: v.optional(v.string()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const days = args.days ?? 30;
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    const allMatches = await ctx.db.query("matches").collect();

    // Group completed matches by day
    const completedByDay: Record<string, number> = {};
    // Group all status changes (approximated by updatedAt) by day
    const activityByDay: Record<string, number> = {};

    for (const match of allMatches) {
      if (match.updatedAt >= cutoff) {
        const dayKey = new Date(match.updatedAt).toISOString().split("T")[0];
        activityByDay[dayKey] = (activityByDay[dayKey] ?? 0) + 1;

        if (match.status === "completed") {
          completedByDay[dayKey] = (completedByDay[dayKey] ?? 0) + 1;
        }
      }
    }

    // Build trend array for each day in the range
    const trend = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(now - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const dayKey = date.toISOString().split("T")[0];
      trend.push({
        date: dayKey,
        completed: completedByDay[dayKey] ?? 0,
        activity: activityByDay[dayKey] ?? 0,
      });
    }

    return trend;
  },
});

/**
 * Latest CRM activity — matches, WhatsApp messages, phone calls.
 * Returns the most recent activity for the admin dashboard.
 */
export const getRecentActivity = query({
  args: {
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 20;

    const activities: Array<{
      type: string;
      timestamp: number;
      data: Record<string, unknown>;
    }> = [];

    // 1. Recent match status changes
    const recentMatches = await ctx.db
      .query("matches")
      .order("desc")
      .take(limit);

    for (const match of recentMatches) {
      const [memberA, memberB] = await Promise.all([
        ctx.db.get(match.memberAId),
        ctx.db.get(match.memberBId),
      ]);

      activities.push({
        type: "match_update",
        timestamp: match.updatedAt,
        data: {
          _id: match._id,
          status: match.status,
          memberAName: memberA
            ? `${memberA.firstName}${memberA.lastName ? ` ${memberA.lastName}` : ""}`
            : "Unknown",
          memberBName: memberB
            ? `${memberB.firstName}${memberB.lastName ? ` ${memberB.lastName}` : ""}`
            : "Unknown",
        },
      });
    }

    // 2. Recent WhatsApp messages
    const recentMessages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    for (const msg of recentMessages) {
      const member = await ctx.db.get(msg.memberId);
      const memberName = member
        ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
        : "Unknown";

      activities.push({
        type: "whatsapp_message",
        timestamp: msg.createdAt,
        data: {
          direction: msg.direction,
          memberName,
          messageType: msg.messageType,
          preview: msg.content.length > 60 ? msg.content.slice(0, 60) + "..." : msg.content,
        },
      });
    }

    // 3. Recent phone calls
    const recentCalls = await ctx.db
      .query("phoneCalls")
      .withIndex("by_created")
      .order("desc")
      .take(limit);

    for (const call of recentCalls) {
      let memberName = "Unknown";
      if (call.memberId) {
        const member = await ctx.db.get(call.memberId);
        if (member) {
          memberName = `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`;
        }
      }

      activities.push({
        type: "phone_call",
        timestamp: call.startedAt,
        data: {
          direction: call.direction,
          memberName,
          status: call.status,
          duration: call.duration,
        },
      });
    }

    // Sort all activities by timestamp desc and take the limit
    activities.sort((a, b) => b.timestamp - a.timestamp);

    return activities.slice(0, limit);
  },
});
