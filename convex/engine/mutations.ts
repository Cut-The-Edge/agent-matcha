// @ts-nocheck
/**
 * Flow Engine — Public Mutations
 *
 * Mutations for managing flow definitions and instances.
 * Used by the dashboard visual editor and flow control API.
 */

import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { INSTANCE_STATUS, NODE_TYPES } from "./types";
import type { FlowContext, FlowNode } from "./types";
import {
  FLOW_NAME,
  FLOW_TYPE,
  FLOW_DESCRIPTION,
  nodes as seedNodes,
  edges as seedEdges,
} from "./matchIntroFlowData";

// ============================================================================
// saveFlowDefinition — Create or update a flow definition
// ============================================================================

export const saveFlowDefinition = mutation({
  args: {
    flowDefinitionId: v.optional(v.id("flowDefinitions")),
    name: v.string(),
    type: v.string(),
    description: v.optional(v.string()),
    nodes: v.array(
      v.object({
        nodeId: v.string(),
        type: v.string(),
        label: v.string(),
        position: v.object({ x: v.number(), y: v.number() }),
        config: v.any(),
      })
    ),
    edges: v.array(
      v.object({
        edgeId: v.string(),
        source: v.string(),
        target: v.string(),
        label: v.optional(v.string()),
        condition: v.optional(v.string()),
      })
    ),
    createdBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.flowDefinitionId) {
      // Update existing
      const existing = await ctx.db.get(args.flowDefinitionId);
      if (!existing) {
        throw new Error(
          `Flow definition ${args.flowDefinitionId} not found`
        );
      }

      await ctx.db.patch(args.flowDefinitionId, {
        name: args.name,
        type: args.type,
        description: args.description,
        nodes: args.nodes,
        edges: args.edges,
        version: existing.version + 1,
        updatedAt: now,
      });

      return args.flowDefinitionId;
    } else {
      // Create new
      const id = await ctx.db.insert("flowDefinitions", {
        name: args.name,
        type: args.type,
        description: args.description,
        nodes: args.nodes,
        edges: args.edges,
        version: 1,
        isActive: false,
        isDefault: false,
        createdBy: args.createdBy,
        createdAt: now,
        updatedAt: now,
      });

      return id;
    }
  },
});

// ============================================================================
// activateFlowDefinition — Set a flow as active (deactivate others)
// ============================================================================

export const activateFlowDefinition = mutation({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
  },
  handler: async (ctx, args) => {
    const flowDef = await ctx.db.get(args.flowDefinitionId);
    if (!flowDef) {
      throw new Error(
        `Flow definition ${args.flowDefinitionId} not found`
      );
    }

    // Deactivate all other flows of the same type
    const sameTypeFlows = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_active", (q) =>
        q.eq("type", flowDef.type).eq("isActive", true)
      )
      .collect();

    for (const otherFlow of sameTypeFlows) {
      if (otherFlow._id !== args.flowDefinitionId) {
        await ctx.db.patch(otherFlow._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
      }
    }

    // Activate the specified flow
    await ctx.db.patch(args.flowDefinitionId, {
      isActive: true,
      updatedAt: Date.now(),
    });

    return args.flowDefinitionId;
  },
});

// ============================================================================
// startFlowInstance — Create a new instance and kick off the flow
// ============================================================================

export const startFlowInstance = mutation({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
    matchId: v.optional(v.id("matches")),
    memberId: v.optional(v.id("members")),
    initialContext: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const flowDef = await ctx.db.get(args.flowDefinitionId);
    if (!flowDef) {
      throw new Error(
        `Flow definition ${args.flowDefinitionId} not found`
      );
    }

    // Find the start node
    const startNode = flowDef.nodes.find(
      (n: FlowNode) => n.type === NODE_TYPES.START
    );
    if (!startNode) {
      throw new Error("Flow definition has no start node");
    }

    // Build initial context
    const defaultContext: FlowContext = {
      responses: {},
      feedbackCategories: [],
      waitingForInput: false,
      timestamps: { flowStarted: Date.now() },
      metadata: {},
    };

    // Merge with any initial context provided
    const context = args.initialContext
      ? { ...defaultContext, ...args.initialContext }
      : defaultContext;

    // If we have a memberId, look up rejection count
    if (args.memberId) {
      const member = await ctx.db.get(args.memberId);
      if (member) {
        context.rejectionCount = member.rejectionCount || 0;
        context.metadata.memberName = member.firstName;
        context.metadata.memberFirstName = member.firstName;
        context.metadata.memberTier = member.tier;
        context.metadata.profileLink = member.profileLink || "";
      }
    }

    const now = Date.now();

    // Create the instance
    const instanceId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: args.flowDefinitionId,
      matchId: args.matchId,
      memberId: args.memberId,
      currentNodeId: startNode.nodeId,
      status: INSTANCE_STATUS.ACTIVE,
      context,
      startedAt: now,
      lastTransitionAt: now,
    });

    // Log the start
    await ctx.db.insert("flowExecutionLogs", {
      instanceId,
      nodeId: startNode.nodeId,
      nodeType: NODE_TYPES.START,
      action: "entered",
      output: JSON.stringify({
        flowName: flowDef.name,
        flowType: flowDef.type,
        matchId: args.matchId,
        memberId: args.memberId,
      }),
      timestamp: now,
    });

    // Advance past the start node
    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      {
        flowInstanceId: instanceId,
        input: undefined,
      }
    );

    return instanceId;
  },
});

// ============================================================================
// pauseFlowInstance — Pause an active instance
// ============================================================================

export const pauseFlowInstance = mutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    if (instance.status !== INSTANCE_STATUS.ACTIVE) {
      throw new Error(
        `Cannot pause instance in status: ${instance.status}`
      );
    }

    await ctx.db.patch(args.flowInstanceId, {
      status: INSTANCE_STATUS.PAUSED,
      lastTransitionAt: Date.now(),
    });

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: instance.currentNodeId,
      nodeType: "system",
      action: "paused",
      timestamp: Date.now(),
    });

    return args.flowInstanceId;
  },
});

// ============================================================================
// resumeFlowInstance — Resume a paused instance
// ============================================================================

export const resumeFlowInstance = mutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    if (instance.status !== INSTANCE_STATUS.PAUSED) {
      throw new Error(
        `Cannot resume instance in status: ${instance.status}`
      );
    }

    await ctx.db.patch(args.flowInstanceId, {
      status: INSTANCE_STATUS.ACTIVE,
      lastTransitionAt: Date.now(),
    });

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: instance.currentNodeId,
      nodeType: "system",
      action: "resumed",
      timestamp: Date.now(),
    });

    // Check if the flow was waiting for input — if not, auto-advance
    const context = instance.context as FlowContext;
    if (!context.waitingForInput) {
      await ctx.scheduler.runAfter(
        0,
        internal.engine.interpreter.advanceFlow,
        {
          flowInstanceId: args.flowInstanceId,
          input: undefined,
        }
      );
    }

    return args.flowInstanceId;
  },
});

// ============================================================================
// resetAndSeedFlow — Delete all flows and re-seed the default flow (active)
// ============================================================================

export const resetAndSeedFlow = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Delete ALL flow definitions + cascade (instances + logs)
    const allFlows = await ctx.db.query("flowDefinitions").collect();

    for (const flow of allFlows) {
      const instances = await ctx.db
        .query("flowInstances")
        .withIndex("by_flow", (q) => q.eq("flowDefinitionId", flow._id))
        .collect();

      for (const instance of instances) {
        const logs = await ctx.db
          .query("flowExecutionLogs")
          .withIndex("by_instance", (q) => q.eq("instanceId", instance._id))
          .collect();
        for (const log of logs) {
          await ctx.db.delete(log._id);
        }
        await ctx.db.delete(instance._id);
      }

      await ctx.db.delete(flow._id);
    }

    // 2. Seed inline — schedule the internal seed then activate it
    await ctx.scheduler.runAfter(
      0,
      internal.engine.mutations.seedAndActivateFlow,
      {}
    );

    return { reset: true, flowsDeleted: allFlows.length };
  },
});

/**
 * Internal: seed the Match Introduction Flow (from spec) and mark it active.
 * Called after resetAndSeedFlow wipes everything.
 */
export const seedAndActivateFlow = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const flowDefinitionId = await ctx.db.insert("flowDefinitions", {
      name: FLOW_NAME,
      type: FLOW_TYPE,
      description: FLOW_DESCRIPTION,
      nodes: seedNodes,
      edges: seedEdges,
      version: 1,
      isActive: true,
      isDefault: true,
      createdBy: "system_seed",
      createdAt: now,
      updatedAt: now,
    });

    return { flowDefinitionId };
  },
});

// ============================================================================
// deleteFlowDefinition — Remove a flow definition and its instances/logs
// ============================================================================

export const deleteFlowDefinition = mutation({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
  },
  handler: async (ctx, args) => {
    const flowDef = await ctx.db.get(args.flowDefinitionId);
    if (!flowDef) {
      throw new Error(
        `Flow definition ${args.flowDefinitionId} not found`
      );
    }

    // Delete all flow instances for this definition
    const instances = await ctx.db
      .query("flowInstances")
      .withIndex("by_flow", (q) =>
        q.eq("flowDefinitionId", args.flowDefinitionId)
      )
      .collect();

    for (const instance of instances) {
      // Delete execution logs for this instance
      const logs = await ctx.db
        .query("flowExecutionLogs")
        .withIndex("by_instance", (q) => q.eq("instanceId", instance._id))
        .collect();

      for (const log of logs) {
        await ctx.db.delete(log._id);
      }

      await ctx.db.delete(instance._id);
    }

    // Delete the flow definition itself
    await ctx.db.delete(args.flowDefinitionId);

    return args.flowDefinitionId;
  },
});
