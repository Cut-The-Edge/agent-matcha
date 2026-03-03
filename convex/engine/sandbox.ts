// @ts-nocheck
/**
 * Sandbox — Start test flows from the dashboard
 *
 * Public mutation (no auth, matching existing engine mutations).
 * Creates a match record, then creates 1-2 flow instances and kicks them off.
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { INSTANCE_STATUS, NODE_TYPES } from "./types";
import type { FlowContext } from "./types";

export const startSandboxFlow = mutation({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
    memberAId: v.id("members"),
    memberBId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const flowDef = await ctx.db.get(args.flowDefinitionId);
    if (!flowDef) {
      throw new Error(`Flow definition ${args.flowDefinitionId} not found`);
    }

    const startNode = flowDef.nodes.find(
      (n: any) => n.type === NODE_TYPES.START
    );
    if (!startNode) {
      throw new Error("Flow definition has no start node");
    }

    const memberA = await ctx.db.get(args.memberAId);
    if (!memberA) {
      throw new Error(`Member A not found: ${args.memberAId}`);
    }

    let memberB = null;
    if (args.memberBId) {
      memberB = await ctx.db.get(args.memberBId);
      if (!memberB) {
        throw new Error(`Member B not found: ${args.memberBId}`);
      }
    }

    // Find an admin for the match record
    const admin = await ctx.db
      .query("admins")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!admin) {
      throw new Error("No active admin found to create sandbox match");
    }

    const now = Date.now();

    // Create the match record
    const matchId = await ctx.db.insert("matches", {
      smaIntroId: `sandbox-${now}`,
      memberAId: args.memberAId,
      memberBId: args.memberBId ?? args.memberAId,
      status: "pending",
      triggeredBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });

    const instanceIds: string[] = [];

    // Start flow for Member A
    const contextA: FlowContext = {
      responses: {},
      feedbackCategories: [],
      waitingForInput: false,
      timestamps: { flowStarted: now },
      metadata: {
        memberFirstName: memberA.firstName,
        matchName: memberB ? memberB.firstName : "Test Partner",
        profileLink: memberA.profileLink || "",
        matchId: String(matchId),
        side: "A",
        sandbox: true,
      },
      rejectionCount: memberA.rejectionCount || 0,
    };

    const instanceAId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: args.flowDefinitionId,
      matchId,
      memberId: args.memberAId,
      currentNodeId: startNode.nodeId,
      status: INSTANCE_STATUS.ACTIVE,
      context: contextA,
      startedAt: now,
      lastTransitionAt: now,
    });

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: instanceAId,
      nodeId: startNode.nodeId,
      nodeType: NODE_TYPES.START,
      action: "entered",
      output: JSON.stringify({
        flowName: flowDef.name,
        flowType: flowDef.type,
        matchId,
        memberId: args.memberAId,
        sandbox: true,
      }),
      timestamp: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      { flowInstanceId: instanceAId, input: undefined }
    );
    instanceIds.push(instanceAId);

    // Start flow for Member B (if provided)
    if (args.memberBId && memberB) {
      const contextB: FlowContext = {
        responses: {},
        feedbackCategories: [],
        waitingForInput: false,
        timestamps: { flowStarted: now },
        metadata: {
          memberFirstName: memberB.firstName,
          matchName: memberA.firstName,
          profileLink: memberB.profileLink || "",
          matchId: String(matchId),
          side: "B",
          sandbox: true,
        },
        rejectionCount: memberB.rejectionCount || 0,
      };

      const instanceBId = await ctx.db.insert("flowInstances", {
        flowDefinitionId: args.flowDefinitionId,
        matchId,
        memberId: args.memberBId,
        currentNodeId: startNode.nodeId,
        status: INSTANCE_STATUS.ACTIVE,
        context: contextB,
        startedAt: now,
        lastTransitionAt: now,
      });

      await ctx.db.insert("flowExecutionLogs", {
        instanceId: instanceBId,
        nodeId: startNode.nodeId,
        nodeType: NODE_TYPES.START,
        action: "entered",
        output: JSON.stringify({
          flowName: flowDef.name,
          flowType: flowDef.type,
          matchId,
          memberId: args.memberBId,
          sandbox: true,
        }),
        timestamp: now,
      });

      await ctx.scheduler.runAfter(
        0,
        internal.engine.interpreter.advanceFlow,
        { flowInstanceId: instanceBId, input: undefined }
      );
      instanceIds.push(instanceBId);
    }

    return { matchId, instanceIds };
  },
});
