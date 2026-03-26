// @ts-nocheck
/**
 * CRM Internal Mutations
 *
 * Processes match-created events: looks up members, creates the match
 * record, finds the active flow definition, and starts a flow instance
 * for the male member only.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { DatabaseWriter } from "../../_generated/server";

/**
 * Ensure a member has a profileToken and profileLink.
 * Generates them if missing, returns the existing ones otherwise.
 */
async function ensureProfileToken(
  db: DatabaseWriter,
  memberId: any,
): Promise<void> {
  const member = await db.get(memberId);
  if (!member || member.profileToken) return;

  const token = crypto.randomUUID();
  await db.patch(memberId, {
    profileToken: token,
    profileLink: `/intro/${token}`,
  });
}

/**
 * Process a match-created event from the CRM.
 *
 * 1. Look up members by SMA ID
 * 2. Create the match record with introToken + flowTriggered
 * 3. Determine male/female members
 * 4. Start a flow instance for the male member only, with profile link to female's page
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
    smaGroupId: v.optional(v.number()),
    smaGroupName: v.optional(v.string()),
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

    // Try to find an admin — SMA-originated matches may not have one
    const admin = await ctx.db
      .query("admins")
      .filter((q) => q.eq(q.field("status"), "active"))
      .first();

    // De-dup: if a match record already exists for this smaMatchId, use it
    // instead of creating a duplicate (SMA can fire match_added + match_group_changed)
    if (args.smaMatchId) {
      const existing = await ctx.db
        .query("matches")
        .withIndex("by_smaIntroId", (q) => q.eq("smaIntroId", args.smaMatchId))
        .first();
      if (existing) {
        if (existing.flowTriggered) {
          return { matchId: existing._id, flowInstancesStarted: 0 };
        }
        // Match exists but flow wasn't triggered yet — fall through to trigger it
        const baseUrl = process.env.APP_URL || "https://agent-matcha.vercel.app";
        const profileLink = `${baseUrl}/intro/${existing.introToken}`;
        const maleMember =
          memberA.gender === "male" ? memberA :
          memberB.gender === "male" ? memberB : null;
        const femaleMember =
          memberA.gender === "female" ? memberA :
          memberB.gender === "female" ? memberB : null;
        if (maleMember && args.smaGroupName === "Automated Intro") {
          const result = await ctx.runMutation(
            internal.integrations.crm.mutations.startFlowForMaleMember,
            { matchId: existing._id }
          );
          return { matchId: existing._id, flowInstancesStarted: result.started ? 1 : 0 };
        }
        return { matchId: existing._id, flowInstancesStarted: 0 };
      }
    }

    // Generate intro token for the public profile page
    const introToken = crypto.randomUUID();

    // Create the match record
    const matchId = await ctx.db.insert("matches", {
      smaIntroId: args.smaMatchId,
      memberAId: memberA._id,
      memberBId: memberB._id,
      status: "pending",
      triggeredBy: admin?._id,
      smaGroupId: args.smaGroupId,
      smaGroupName: args.smaGroupName,
      flowTriggered: false,
      introToken,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Ensure both members have profile tokens
    await ensureProfileToken(ctx.db, memberA._id);
    await ensureProfileToken(ctx.db, memberB._id);

    // Only trigger flow for "Automated Intro" group
    if (args.smaGroupName !== "Automated Intro") {
      return { matchId, flowInstancesStarted: 0 };
    }

    // Determine male / female members
    const maleMember =
      memberA.gender === "male" ? memberA :
      memberB.gender === "male" ? memberB :
      null;

    const femaleMember =
      memberA.gender === "female" ? memberA :
      memberB.gender === "female" ? memberB :
      null;

    if (!maleMember) {
      console.warn(
        `processMatchCreated: no male member found for match ${matchId} ` +
        `(A.gender=${memberA.gender}, B.gender=${memberB.gender}). ` +
        `Flow will be triggered later when gender data is synced.`
      );
      return { matchId, flowInstancesStarted: 0 };
    }

    // Build the profile link for the female member's profile page
    const baseUrl = process.env.APP_URL || "https://agent-matcha.vercel.app";
    const profileLink = `${baseUrl}/intro/${introToken}`;

    // Determine the match name (the female member's first name shown to the male)
    const matchName = femaleMember
      ? femaleMember.firstName
      : (maleMember._id === memberA._id ? (args.memberBName || memberB.firstName) : (args.memberAName || memberA.firstName));

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

    // Start flow for the male member only
    const instanceId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: flowDef._id,
      matchId,
      memberId: maleMember._id,
      currentNodeId: startNode.nodeId,
      status: "active",
      context: {
        responses: {},
        feedbackCategories: [],
        waitingForInput: false,
        timestamps: { flowStarted: Date.now() },
        metadata: {
          memberFirstName: maleMember.firstName,
          matchFirstName: matchName,
          matchName,
          profileLink,
          matchId: String(matchId),
          side: maleMember._id === memberA._id ? "A" : "B",
        },
        rejectionCount: maleMember.rejectionCount || 0,
      },
      startedAt: Date.now(),
      lastTransitionAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      { flowInstanceId: instanceId, input: undefined }
    );

    // Mark flow as triggered
    await ctx.db.patch(matchId, { flowTriggered: true, updatedAt: Date.now() });

    return { matchId, flowInstancesStarted: 1 };
  },
});

/**
 * Start the WhatsApp flow for the male member of an existing match.
 * Used by the sync reconciliation and webhook trigger paths.
 *
 * De-dup guard: re-reads match in transaction and checks flowTriggered.
 */
export const startFlowForMaleMember = internalMutation({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      console.warn(`startFlowForMaleMember: match not found ${args.matchId}`);
      return { started: false, reason: "match_not_found" };
    }

    // De-dup guard
    if (match.flowTriggered) {
      return { started: false, reason: "already_triggered" };
    }

    const memberA = await ctx.db.get(match.memberAId);
    const memberB = await ctx.db.get(match.memberBId);

    if (!memberA || !memberB) {
      return { started: false, reason: "members_not_found" };
    }

    const maleMember =
      memberA.gender === "male" ? memberA :
      memberB.gender === "male" ? memberB :
      null;

    const femaleMember =
      memberA.gender === "female" ? memberA :
      memberB.gender === "female" ? memberB :
      null;

    if (!maleMember) {
      console.warn(`startFlowForMaleMember: no male member for match ${args.matchId}`);
      return { started: false, reason: "no_male_member" };
    }

    // Generate introToken if not already set
    let introToken = match.introToken;
    if (!introToken) {
      introToken = crypto.randomUUID();
      await ctx.db.patch(args.matchId, { introToken });
    }

    // Ensure both members have profile tokens
    await ensureProfileToken(ctx.db, memberA._id);
    await ensureProfileToken(ctx.db, memberB._id);

    const baseUrl = process.env.APP_URL || "https://agent-matcha.vercel.app";
    const profileLink = `${baseUrl}/intro/${introToken}`;

    const matchName = femaleMember
      ? femaleMember.firstName
      : (maleMember._id === memberA._id ? memberB.firstName : memberA.firstName);

    // Find the active match_feedback flow definition
    const flowDef = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_active", (q) =>
        q.eq("type", "match_feedback").eq("isActive", true)
      )
      .first();

    if (!flowDef) {
      console.warn("startFlowForMaleMember: no active match_feedback flow definition");
      return { started: false, reason: "no_flow_def" };
    }

    const startNode = flowDef.nodes.find((n: any) => n.type === "start");
    if (!startNode) {
      console.warn("startFlowForMaleMember: flow definition has no START node");
      return { started: false, reason: "no_start_node" };
    }

    const instanceId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: flowDef._id,
      matchId: args.matchId,
      memberId: maleMember._id,
      currentNodeId: startNode.nodeId,
      status: "active",
      context: {
        responses: {},
        feedbackCategories: [],
        waitingForInput: false,
        timestamps: { flowStarted: Date.now() },
        metadata: {
          memberFirstName: maleMember.firstName,
          matchFirstName: matchName,
          matchName,
          profileLink,
          matchId: String(args.matchId),
          side: maleMember._id === memberA._id ? "A" : "B",
        },
        rejectionCount: maleMember.rejectionCount || 0,
      },
      startedAt: Date.now(),
      lastTransitionAt: Date.now(),
    });

    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      { flowInstanceId: instanceId, input: undefined }
    );

    // Mark flow as triggered
    await ctx.db.patch(args.matchId, { flowTriggered: true, updatedAt: Date.now() });

    return { started: true, flowInstanceId: instanceId };
  },
});

/**
 * Start the Post-Date Feedback Flow for BOTH members of a match.
 *
 * Unlike the intro flow (male only), this creates two flow instances —
 * one per member — so both sides provide post-date feedback independently.
 */
export const startFeedbackFlowForBothMembers = internalMutation({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db.get(args.matchId);
    if (!match) {
      return { started: false, reason: "match_not_found" };
    }

    if (match.feedbackFlowTriggered) {
      return { started: false, reason: "already_triggered" };
    }

    const memberA = await ctx.db.get(match.memberAId);
    const memberB = await ctx.db.get(match.memberBId);

    if (!memberA || !memberB) {
      return { started: false, reason: "members_not_found" };
    }

    // Find the active post_date_feedback flow definition
    const flowDef = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_active", (q) =>
        q.eq("type", "post_date_feedback").eq("isActive", true)
      )
      .first();

    if (!flowDef) {
      console.warn("startFeedbackFlowForBothMembers: no active post_date_feedback flow definition");
      return { started: false, reason: "no_flow_def" };
    }

    const startNode = flowDef.nodes.find((n: any) => n.type === "start");
    if (!startNode) {
      console.warn("startFeedbackFlowForBothMembers: flow definition has no START node");
      return { started: false, reason: "no_start_node" };
    }

    const instanceIds: string[] = [];

    // Start a flow instance for each member
    for (const member of [memberA, memberB]) {
      const otherMember = member._id === memberA._id ? memberB : memberA;

      const instanceId = await ctx.db.insert("flowInstances", {
        flowDefinitionId: flowDef._id,
        matchId: args.matchId,
        memberId: member._id,
        currentNodeId: startNode.nodeId,
        status: "active",
        context: {
          responses: {},
          feedbackCategories: [],
          waitingForInput: false,
          timestamps: { flowStarted: Date.now() },
          metadata: {
            memberFirstName: member.firstName,
            matchFirstName: otherMember.firstName,
            matchName: otherMember.firstName,
            matchId: String(args.matchId),
            side: member._id === memberA._id ? "A" : "B",
            consecutiveBadDates: member.consecutiveBadDates || 0,
          },
        },
        startedAt: Date.now(),
        lastTransitionAt: Date.now(),
      });

      // Kick off the flow (START → delay → first message)
      await ctx.scheduler.runAfter(
        0,
        internal.engine.interpreter.advanceFlow,
        { flowInstanceId: instanceId, input: undefined }
      );

      instanceIds.push(instanceId);
    }

    // Mark feedback flow as triggered + update match status
    await ctx.db.patch(args.matchId, {
      feedbackFlowTriggered: true,
      status: "date_completed",
      updatedAt: Date.now(),
    });

    console.log(
      `Post-date feedback flow started for match ${args.matchId}: ` +
      `${memberA.firstName} (${instanceIds[0]}), ${memberB.firstName} (${instanceIds[1]})`
    );

    return { started: true, flowInstanceIds: instanceIds };
  },
});
