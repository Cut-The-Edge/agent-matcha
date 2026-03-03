// @ts-nocheck
/**
 * CRM Internal Mutations
 *
 * Processes match-created events: looks up members, creates the match
 * record, finds the active flow definition, and starts flow instances.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Process a match-created event from the CRM.
 *
 * 1. Look up members by SMA ID
 * 2. Create the match record
 * 3. Find the active match_feedback flow definition
 * 4. Start a flow instance for each member
 */
export const processMatchCreated = internalMutation({
  args: {
    smaMatchId: v.optional(v.string()),
    smaIdA: v.string(),
    smaIdB: v.string(),
    memberAName: v.optional(v.string()),
    memberBName: v.optional(v.string()),
    profileLinkA: v.optional(v.string()),
    profileLinkB: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up members by SMA ID
    const memberA = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaIdA))
      .first();

    const memberB = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaIdB))
      .first();

    if (!memberA || !memberB) {
      throw new Error(
        `Members not found: A=${args.smaIdA} (${memberA ? "found" : "missing"}), B=${args.smaIdB} (${memberB ? "found" : "missing"})`
      );
    }

    // We need an admin ID for the match — use the first active admin
    const admin = await ctx.db
      .query("admins")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    if (!admin) {
      throw new Error("No active admin found to trigger match");
    }

    // Create the match record
    const matchId = await ctx.db.insert("matches", {
      smaIntroId: args.smaMatchId,
      memberAId: memberA._id,
      memberBId: memberB._id,
      status: "pending",
      triggeredBy: admin._id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Find the active match_feedback flow definition
    const flowDef = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_active", (q) =>
        q.eq("type", "match_feedback").eq("isActive", true)
      )
      .first();

    if (!flowDef) {
      console.warn("No active match_feedback flow definition found");
      return { matchId, flowInstancesStarted: 0 };
    }

    // Find the START node
    const startNode = flowDef.nodes.find((n: any) => n.type === "start");
    if (!startNode) {
      console.warn("Flow definition has no START node");
      return { matchId, flowInstancesStarted: 0 };
    }

    let flowInstancesStarted = 0;

    // Start flow for Member A
    const instanceAId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: flowDef._id,
      matchId,
      memberId: memberA._id,
      currentNodeId: startNode.nodeId,
      status: "active",
      context: {
        responses: {},
        feedbackCategories: [],
        waitingForInput: false,
        timestamps: { flowStarted: Date.now() },
        metadata: {
          memberFirstName: memberA.firstName,
          matchName: args.memberBName || memberB.firstName,
          profileLink: args.profileLinkA || "",
          matchId: String(matchId),
          side: "A",
        },
        rejectionCount: memberA.rejectionCount || 0,
      },
      startedAt: Date.now(),
      lastTransitionAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      { flowInstanceId: instanceAId, input: undefined }
    );
    flowInstancesStarted++;

    // Start flow for Member B
    const instanceBId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: flowDef._id,
      matchId,
      memberId: memberB._id,
      currentNodeId: startNode.nodeId,
      status: "active",
      context: {
        responses: {},
        feedbackCategories: [],
        waitingForInput: false,
        timestamps: { flowStarted: Date.now() },
        metadata: {
          memberFirstName: memberB.firstName,
          matchName: args.memberAName || memberA.firstName,
          profileLink: args.profileLinkB || "",
          matchId: String(matchId),
          side: "B",
        },
        rejectionCount: memberB.rejectionCount || 0,
      },
      startedAt: Date.now(),
      lastTransitionAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      { flowInstanceId: instanceBId, input: undefined }
    );
    flowInstancesStarted++;

    return { matchId, flowInstancesStarted };
  },
});
