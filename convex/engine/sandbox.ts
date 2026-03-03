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

    // Create the match record (§7.1: "Active Introductions" — match sent, awaiting response)
    const matchId = await ctx.db.insert("matches", {
      smaIntroId: `sandbox-${now}`,
      memberAId: args.memberAId,
      memberBId: args.memberBId ?? args.memberAId,
      status: "active",
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

/**
 * Reset a member to a clean state for sandbox testing.
 * Deletes all their matches, flow instances, execution logs,
 * payments, feedback, and whatsapp messages.
 * Resets rejectionCount to 0 and status to "active".
 */
export const resetMember = mutation({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    // 1. Find all matches involving this member
    const matchesA = await ctx.db
      .query("matches")
      .withIndex("by_memberA", (q) => q.eq("memberAId", args.memberId))
      .collect();
    const matchesB = await ctx.db
      .query("matches")
      .withIndex("by_memberB", (q) => q.eq("memberBId", args.memberId))
      .collect();
    // Deduplicate — sandbox uses same member for A and B
    const seen = new Set<string>();
    const allMatches = [...matchesA, ...matchesB].filter((m) => {
      if (seen.has(m._id)) return false;
      seen.add(m._id);
      return true;
    });

    // 2. Find all flow instances for this member
    const instances = await ctx.db
      .query("flowInstances")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();

    // 3. Delete execution logs for each instance
    for (const inst of instances) {
      const logs = await ctx.db
        .query("flowExecutionLogs")
        .withIndex("by_instance", (q) => q.eq("instanceId", inst._id))
        .collect();
      for (const log of logs) {
        await ctx.db.delete(log._id);
      }
    }

    // 4. Delete flow instances
    for (const inst of instances) {
      await ctx.db.delete(inst._id);
    }

    // 5. Delete payments for this member
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
    for (const p of payments) {
      await ctx.db.delete(p._id);
    }

    // 6. Delete feedback for this member
    const feedback = await ctx.db
      .query("feedback")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
    for (const f of feedback) {
      await ctx.db.delete(f._id);
    }

    // 7. Delete whatsapp messages for this member
    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }

    // 8. Delete all matches
    for (const match of allMatches) {
      await ctx.db.delete(match._id);
    }

    // 9. Reset member to clean state
    await ctx.db.patch(args.memberId, {
      rejectionCount: 0,
      status: "active",
      updatedAt: Date.now(),
    });

    return {
      deleted: {
        matches: allMatches.length,
        instances: instances.length,
        payments: payments.length,
        feedback: feedback.length,
        messages: messages.length,
      },
    };
  },
});
