// @ts-nocheck
/**
 * Flow Engine — Public Queries
 *
 * Read-only queries for the flow engine. Used by the dashboard
 * visual editor and monitoring tools.
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

// ============================================================================
// getFlowDefinition — Get a flow definition by ID
// ============================================================================

export const getFlowDefinition = query({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.flowDefinitionId);
  },
});

// ============================================================================
// listFlowDefinitions — List all flows, optionally filtered by type
// ============================================================================

export const listFlowDefinitions = query({
  args: {
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.type) {
      return await ctx.db
        .query("flowDefinitions")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .collect();
    }
    return await ctx.db.query("flowDefinitions").collect();
  },
});

// ============================================================================
// getActiveFlow — Get the currently active flow for a given type
// ============================================================================

export const getActiveFlow = query({
  args: {
    type: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("flowDefinitions")
      .withIndex("by_active", (q) =>
        q.eq("type", args.type).eq("isActive", true)
      )
      .first();
  },
});

// ============================================================================
// getFlowInstance — Get an instance by ID with current state
// ============================================================================

export const getFlowInstance = query({
  args: {
    flowInstanceId: v.id("flowInstances"),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return null;

    // Enrich with flow definition info
    const flowDef = await ctx.db.get(instance.flowDefinitionId);

    return {
      ...instance,
      flowDefinition: flowDef
        ? {
            name: flowDef.name,
            type: flowDef.type,
            version: flowDef.version,
          }
        : null,
    };
  },
});

// ============================================================================
// listFlowInstances — List instances by match or member
// ============================================================================

export const listFlowInstances = query({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.optional(v.id("matches")),
    memberId: v.optional(v.id("members")),
    status: v.optional(v.string()),
    flowDefinitionId: v.optional(v.id("flowDefinitions")),
  },
  handler: async (ctx, args) => {
    let results;

    if (args.matchId) {
      results = await ctx.db
        .query("flowInstances")
        .withIndex("by_match", (q) => q.eq("matchId", args.matchId!))
        .collect();
    } else if (args.memberId) {
      results = await ctx.db
        .query("flowInstances")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId!))
        .collect();
    } else if (args.status) {
      results = await ctx.db
        .query("flowInstances")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else if (args.flowDefinitionId) {
      results = await ctx.db
        .query("flowInstances")
        .withIndex("by_flow", (q) =>
          q.eq("flowDefinitionId", args.flowDefinitionId!)
        )
        .collect();
    } else {
      results = await ctx.db.query("flowInstances").collect();
    }

    // Apply additional filters if multiple criteria given
    if (args.status && args.matchId) {
      results = results.filter((r) => r.status === args.status);
    }
    if (args.status && args.memberId) {
      results = results.filter((r) => r.status === args.status);
    }

    return results;
  },
});

// ============================================================================
// getExecutionLog — Get execution logs for an instance
// ============================================================================

export const getExecutionLog = query({
  args: {
    sessionToken: v.optional(v.string()),
    instanceId: v.id("flowInstances"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const query = ctx.db
      .query("flowExecutionLogs")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .order("desc");

    if (args.limit) {
      return await query.take(args.limit);
    }

    return await query.collect();
  },
});
