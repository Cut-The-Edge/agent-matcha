/**
 * Token Usage Tracking
 *
 * Mutations and queries for logging and querying LLM token usage
 * across all AI-powered processes in Agent Matcha.
 *
 * Usage:
 *   - Call `logTokenUsage` after every LLM call to record tokens + cost
 *   - Use the query functions to build analytics dashboards
 */

import { v } from "convex/values";
import {
  internalMutation,
  query,
} from "../_generated/server";
import { requireAuth } from "../auth/authz";

// ============================================================================
// Process type validator (matches schema union)
// ============================================================================

const processTypeValidator = v.union(
  v.literal("voice-intake"),
  v.literal("summarization"),
  v.literal("whatsapp-feedback"),
  v.literal("whatsapp-intro"),
  v.literal("whatsapp-personalization"),
  v.literal("whatsapp-classification"),
  v.literal("whatsapp-followup"),
  v.literal("feedback-analysis"),
  v.literal("recalibration-analysis"),
  v.literal("other"),
);

const providerValidator = v.union(
  v.literal("openai"),
  v.literal("anthropic"),
  v.literal("openrouter"),
  v.literal("google"),
  v.literal("other"),
);

// ============================================================================
// Types
// ============================================================================

/** Shape of a single process-type usage bucket (returned by getUsageByProcessType). */
interface ProcessTypeBucket {
  processType: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
  avgLatencyMs: number;
}

/** Shape of a single provider+model cost bucket (returned by getCostBreakdown). */
interface ModelCostBucket {
  provider: string;
  model: string;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
}

/** Shape of a daily trend point (returned by getDailyCostTrend). */
interface DailyTrendPoint {
  date: string;
  totalCostUsd: number;
  totalTokens: number;
  callCount: number;
}

// ============================================================================
// Mutations
// ============================================================================

/**
 * Log a single token usage event. Called internally after each LLM call.
 */
export const logTokenUsage = internalMutation({
  args: {
    processType: processTypeValidator,
    provider: providerValidator,
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.number(),
    latencyMs: v.optional(v.number()),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tokenUsage", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

// ============================================================================
// Queries (authenticated, for dashboard)
// ============================================================================

/**
 * Get token usage summary grouped by process type within a date range.
 */
export const getUsageByProcessType = query({
  args: {
    sessionToken: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ProcessTypeBucket[]> => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;

    const allUsage = await ctx.db
      .query("tokenUsage")
      .withIndex("by_created")
      .collect();

    const filtered = allUsage.filter(
      (u) => u.createdAt >= startDate && u.createdAt <= endDate,
    );

    const byProcess: Record<string, ProcessTypeBucket> = {};

    for (const usage of filtered) {
      if (!byProcess[usage.processType]) {
        byProcess[usage.processType] = {
          processType: usage.processType,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalTokens: 0,
          totalCostUsd: 0,
          callCount: 0,
          avgLatencyMs: 0,
        };
      }
      const bucket = byProcess[usage.processType];
      bucket.totalInputTokens += usage.inputTokens;
      bucket.totalOutputTokens += usage.outputTokens;
      bucket.totalTokens += usage.totalTokens;
      bucket.totalCostUsd += usage.costUsd;
      bucket.callCount += 1;
      if (usage.latencyMs) {
        bucket.avgLatencyMs += usage.latencyMs;
      }
    }

    // Compute averages
    for (const bucket of Object.values(byProcess)) {
      if (bucket.callCount > 0) {
        bucket.avgLatencyMs = Math.round(
          bucket.avgLatencyMs / bucket.callCount,
        );
        bucket.totalCostUsd =
          Math.round(bucket.totalCostUsd * 10000) / 10000;
      }
    }

    return Object.values(byProcess).sort(
      (a, b) => b.totalCostUsd - a.totalCostUsd,
    );
  },
});

/**
 * Get cost breakdown by provider and model within a date range.
 */
export const getCostBreakdown = query({
  args: {
    sessionToken: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ModelCostBucket[]> => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;

    const allUsage = await ctx.db
      .query("tokenUsage")
      .withIndex("by_created")
      .collect();

    const filtered = allUsage.filter(
      (u) => u.createdAt >= startDate && u.createdAt <= endDate,
    );

    // Group by provider+model
    const byModel: Record<string, ModelCostBucket> = {};

    for (const usage of filtered) {
      const key = `${usage.provider}/${usage.model}`;
      if (!byModel[key]) {
        byModel[key] = {
          provider: usage.provider,
          model: usage.model,
          totalTokens: 0,
          totalCostUsd: 0,
          callCount: 0,
        };
      }
      byModel[key].totalTokens += usage.totalTokens;
      byModel[key].totalCostUsd += usage.costUsd;
      byModel[key].callCount += 1;
    }

    for (const bucket of Object.values(byModel)) {
      bucket.totalCostUsd =
        Math.round(bucket.totalCostUsd * 10000) / 10000;
    }

    return Object.values(byModel).sort(
      (a, b) => b.totalCostUsd - a.totalCostUsd,
    );
  },
});

/**
 * Get daily cost trend for the last N days.
 */
export const getDailyCostTrend = query({
  args: {
    sessionToken: v.optional(v.string()),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DailyTrendPoint[]> => {
    await requireAuth(ctx, args.sessionToken);

    const days = args.days ?? 30;
    const now = Date.now();
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    const allUsage = await ctx.db
      .query("tokenUsage")
      .withIndex("by_created")
      .collect();

    const filtered = allUsage.filter((u) => u.createdAt >= cutoff);

    // Group by day
    const byDay: Record<string, DailyTrendPoint> = {};

    for (const usage of filtered) {
      const dayKey = new Date(usage.createdAt).toISOString().split("T")[0];
      if (!byDay[dayKey]) {
        byDay[dayKey] = {
          date: dayKey,
          totalCostUsd: 0,
          totalTokens: 0,
          callCount: 0,
        };
      }
      byDay[dayKey].totalCostUsd += usage.costUsd;
      byDay[dayKey].totalTokens += usage.totalTokens;
      byDay[dayKey].callCount += 1;
    }

    // Build trend array for every day in range
    const trend: DailyTrendPoint[] = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(now - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const dayKey = date.toISOString().split("T")[0];
      const entry = byDay[dayKey];
      trend.push({
        date: dayKey,
        totalCostUsd: entry
          ? Math.round(entry.totalCostUsd * 10000) / 10000
          : 0,
        totalTokens: entry ? entry.totalTokens : 0,
        callCount: entry ? entry.callCount : 0,
      });
    }

    return trend;
  },
});

/**
 * Get summary totals (used for the stat cards on the dashboard).
 */
export const getTokenUsageSummary = query({
  args: {
    sessionToken: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();
    const startDate = args.startDate ?? now - 30 * 24 * 60 * 60 * 1000;
    const endDate = args.endDate ?? now;

    const allUsage = await ctx.db
      .query("tokenUsage")
      .withIndex("by_created")
      .collect();

    const filtered = allUsage.filter(
      (u) => u.createdAt >= startDate && u.createdAt <= endDate,
    );

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;
    let totalLatencyMs = 0;
    let latencyCount = 0;

    for (const usage of filtered) {
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalTokens += usage.totalTokens;
      totalCostUsd += usage.costUsd;
      if (usage.latencyMs) {
        totalLatencyMs += usage.latencyMs;
        latencyCount += 1;
      }
    }

    return {
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
      totalCalls: filtered.length,
      avgLatencyMs:
        latencyCount > 0 ? Math.round(totalLatencyMs / latencyCount) : 0,
      uniqueModels: [
        ...new Set(filtered.map((u) => `${u.provider}/${u.model}`)),
      ].length,
      uniqueProcesses: [...new Set(filtered.map((u) => u.processType))].length,
    };
  },
});

/**
 * Get client-facing usage summary for the current month.
 * Groups costs into "Phone Agent" (voice-intake, summarization) and
 * "WhatsApp Bot" (whatsapp-*) categories, plus per-operation averages
 * and projected monthly cost.
 */
export const getClientUsageSummary = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();

    // Current month boundaries
    const currentMonthStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    ).getTime();
    const currentMonthEnd = now;

    const allUsage = await ctx.db
      .query("tokenUsage")
      .withIndex("by_created")
      .collect();

    const monthUsage = allUsage.filter(
      (u) => u.createdAt >= currentMonthStart && u.createdAt <= currentMonthEnd,
    );

    // Category definitions
    const phoneProcesses = new Set([
      "voice-intake",
      "summarization",
    ]);
    const whatsappProcesses = new Set([
      "whatsapp-feedback",
      "whatsapp-intro",
      "whatsapp-personalization",
      "whatsapp-classification",
      "whatsapp-followup",
    ]);

    let phoneAgentCost = 0;
    let phoneAgentCalls = 0;
    let whatsappBotCost = 0;
    let whatsappBotCalls = 0;
    let otherCost = 0;
    let otherCalls = 0;

    // Per-operation breakdown
    let intakeCost = 0;
    let intakeCount = 0;
    let feedbackCost = 0;
    let feedbackCount = 0;
    let introCost = 0;
    let introCount = 0;
    let analysisCost = 0;
    let analysisCount = 0;

    for (const usage of monthUsage) {
      if (phoneProcesses.has(usage.processType)) {
        phoneAgentCost += usage.costUsd;
        phoneAgentCalls += 1;
      } else if (whatsappProcesses.has(usage.processType)) {
        whatsappBotCost += usage.costUsd;
        whatsappBotCalls += 1;
      } else {
        otherCost += usage.costUsd;
        otherCalls += 1;
      }

      // Per-operation
      if (usage.processType === "voice-intake") {
        intakeCost += usage.costUsd;
        intakeCount += 1;
      } else if (usage.processType === "whatsapp-feedback") {
        feedbackCost += usage.costUsd;
        feedbackCount += 1;
      } else if (usage.processType === "whatsapp-intro") {
        introCost += usage.costUsd;
        introCount += 1;
      } else if (
        usage.processType === "feedback-analysis" ||
        usage.processType === "recalibration-analysis"
      ) {
        analysisCost += usage.costUsd;
        analysisCount += 1;
      }
    }

    const totalMonthCost = phoneAgentCost + whatsappBotCost + otherCost;

    // Projected monthly cost: extrapolate based on days elapsed
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 1,
      0,
    ).getDate();
    const projectedMonthlyCost =
      dayOfMonth > 0
        ? (totalMonthCost / dayOfMonth) * daysInMonth
        : 0;

    return {
      monthLabel: new Date().toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      totalMonthCost: Math.round(totalMonthCost * 10000) / 10000,
      projectedMonthlyCost:
        Math.round(projectedMonthlyCost * 10000) / 10000,
      categories: {
        phoneAgent: {
          cost: Math.round(phoneAgentCost * 10000) / 10000,
          calls: phoneAgentCalls,
        },
        whatsappBot: {
          cost: Math.round(whatsappBotCost * 10000) / 10000,
          calls: whatsappBotCalls,
        },
        other: {
          cost: Math.round(otherCost * 10000) / 10000,
          calls: otherCalls,
        },
      },
      perOperation: {
        avgIntakeCall:
          intakeCount > 0
            ? Math.round((intakeCost / intakeCount) * 1_000_000) / 1_000_000
            : 0,
        avgFeedbackCycle:
          feedbackCount > 0
            ? Math.round((feedbackCost / feedbackCount) * 1_000_000) /
              1_000_000
            : 0,
        avgIntroCycle:
          introCount > 0
            ? Math.round((introCost / introCount) * 1_000_000) / 1_000_000
            : 0,
        avgAnalysis:
          analysisCount > 0
            ? Math.round((analysisCost / analysisCount) * 1_000_000) /
              1_000_000
            : 0,
      },
      totalCalls: monthUsage.length,
      dayOfMonth,
      daysInMonth,
    };
  },
});
