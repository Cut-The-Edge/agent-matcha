// @ts-nocheck
/**
 * Action Queue Mutations
 *
 * Creates and manages action queue items — outreach tasks, follow-ups,
 * and other work items that Dani needs to act on. Each item tracks
 * outreach outcome, intelligence briefs, and follow-up scheduling.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authz";

// ============================================================================
// createActionItem — Auto-called when flow ends at human touchpoint / payment
// ============================================================================

export const createActionItem = internalMutation({
  args: {
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    flowInstanceId: v.optional(v.id("flowInstances")),
    type: v.union(
      v.literal("outreach_needed"),
      v.literal("outreach_pending"),
      v.literal("follow_up_reminder"),
      v.literal("payment_pending"),
      v.literal("recalibration_due"),
      v.literal("ghosting_detected"),
      v.literal("unrecognized_response"),
      v.literal("frustrated_member"),
    ),
    priority: v.union(
      v.literal("urgent"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low"),
    ),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Dedup: skip if a non-terminal item already exists for this match+type
    if (args.matchId) {
      const existing = await ctx.db
        .query("actionQueue")
        .withIndex("by_matchId", (q) => q.eq("matchId", args.matchId))
        .collect();

      const duplicate = existing.find(
        (item) =>
          item.type === args.type &&
          item.status !== "resolved" &&
          item.status !== "expired"
      );

      if (duplicate) {
        console.log(
          `[action-queue] Skipping duplicate ${args.type} for match ${args.matchId}`
        );
        return duplicate._id;
      }
    }

    // Look up member name for notifications
    const member = await ctx.db.get(args.memberId);
    const memberName = member
      ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
      : "Unknown Member";

    // Look up match partner name
    let matchPartnerName = "";
    if (args.matchId) {
      const match = await ctx.db.get(args.matchId);
      if (match) {
        const partnerId =
          match.memberAId === args.memberId
            ? match.memberBId
            : match.memberAId;
        const partner = await ctx.db.get(partnerId);
        matchPartnerName = partner
          ? `${partner.firstName}${partner.lastName ? ` ${partner.lastName}` : ""}`
          : "Unknown";
      }
    }

    const now = Date.now();

    const itemId = await ctx.db.insert("actionQueue", {
      memberId: args.memberId,
      matchId: args.matchId,
      flowInstanceId: args.flowInstanceId,
      type: args.type,
      priority: args.priority,
      status: "pending",
      context: args.context,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule WhatsApp notification to Dani
    await ctx.scheduler.runAfter(
      0,
      internal.actionQueue.notify.notifyAdmin,
      { actionItemId: itemId }
    );

    // Create in-dashboard notification
    const TYPE_LABELS: Record<string, string> = {
      outreach_needed: "Outreach Needed",
      outreach_pending: "Outreach Pending",
      follow_up_reminder: "Follow-up Reminder",
      payment_pending: "Payment Pending",
      recalibration_due: "Recalibration Due",
      ghosting_detected: "Ghosting Detected",
      unrecognized_response: "Unrecognized Response",
      frustrated_member: "Frustrated Member",
    };

    const severityMap: Record<string, "info" | "warning" | "urgent"> = {
      outreach_needed: "info",
      outreach_pending: "info",
      follow_up_reminder: "warning",
      payment_pending: "info",
      recalibration_due: "warning",
      ghosting_detected: "warning",
      unrecognized_response: "warning",
      frustrated_member: "urgent",
    };

    const label = TYPE_LABELS[args.type] || args.type;
    const description = matchPartnerName
      ? `${memberName} → ${matchPartnerName}`
      : memberName;

    await ctx.scheduler.runAfter(
      0,
      internal.notifications.mutations.createNotification,
      {
        type: "action_queue" as const,
        title: `Action: ${label}`,
        message: description,
        severity: severityMap[args.type] || "info",
        actionUrl: "/dashboard/actions",
        relatedEntityType: "actionItem" as const,
        relatedEntityId: String(itemId),
      }
    );

    console.log(
      `[action-queue] Created ${args.type} for ${memberName} (${itemId})`
    );

    return itemId;
  },
});

// ============================================================================
// updateOutreachOutcome — Dani records one of 3 outcomes
// ============================================================================

export const updateOutreachOutcome = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
    outreachOutcome: v.union(
      v.literal("match_interested"),
      v.literal("match_not_interested"),
      v.literal("match_no_response"),
    ),
    outreachNotes: v.optional(v.string()),
    matchIntelligenceBrief: v.optional(v.string()),
    followUpDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new Error(`Action item not found: ${args.actionItemId}`);

    const now = Date.now();
    const patch: Record<string, any> = {
      outreachOutcome: args.outreachOutcome,
      outreachContactedAt: now,
      updatedAt: now,
    };

    if (args.outreachNotes) {
      patch.outreachNotes = args.outreachNotes;
    }

    if (args.matchIntelligenceBrief) {
      patch.matchIntelligenceBrief = args.matchIntelligenceBrief;
    }

    // Route based on outcome
    if (args.outreachOutcome === "match_no_response") {
      // Stay in_progress, set follow-up date (default: 5 days if none specified)
      patch.status = "in_progress";
      const FIVE_DAYS = 5 * 24 * 60 * 60 * 1000;
      patch.followUpDate = args.followUpDate || (now + FIVE_DAYS);
    } else {
      // match_interested or match_not_interested → resolved
      patch.status = "resolved";
      patch.resolvedAt = now;
      patch.resolvedBy = admin._id;
    }

    await ctx.db.patch(args.actionItemId, patch);

    // Trigger outreach continuation flow for all outcomes
    // Each outcome routes to a different branch in the flow
    if (item.matchId && item.memberId) {
      // Find the outreach_continuation flow definition
      const flowDef = await ctx.db
        .query("flowDefinitions")
        .withIndex("by_type", (q) => q.eq("type", "outreach_continuation"))
        .first();

      if (flowDef) {
        // Look up match partner info for the flow context
        const match = await ctx.db.get(item.matchId);
        let matchPhone = "";
        let matchFirstName = "";
        if (match) {
          const partnerId =
            match.memberAId === item.memberId
              ? match.memberBId
              : match.memberAId;
          const partner = await ctx.db.get(partnerId);
          if (partner) {
            matchFirstName = partner.firstName || "";
            matchPhone = partner.phone || "";
          }
        }

        const member = await ctx.db.get(item.memberId);
        const memberFirstName = member?.firstName || "";

        // For match_not_interested: generate AI decline insight first,
        // then start the flow with the insight in context.
        // For other outcomes: start the flow immediately.
        if (args.outreachOutcome === "match_not_interested" && args.outreachNotes) {
          // Schedule AI insight generation → it will start the flow after
          await ctx.scheduler.runAfter(
            0,
            internal.actionQueue.actions.generateDeclineInsightAndStartFlow,
            {
              flowDefinitionId: flowDef._id,
              matchId: item.matchId,
              memberId: item.memberId,
              outreachOutcome: args.outreachOutcome,
              outreachNotes: args.outreachNotes,
              memberFirstName,
              matchFirstName,
              matchPhone,
            }
          );
        } else {
          // Start the continuation flow immediately
          const instanceId = await ctx.db.insert("flowInstances", {
            flowDefinitionId: flowDef._id,
            matchId: item.matchId,
            memberId: item.memberId,
            currentNodeId: "oc_start",
            status: "active",
            context: {
              responses: {},
              feedbackCategories: [],
              waitingForInput: false,
              timestamps: { flowStarted: now },
              outreachOutcome: args.outreachOutcome,
              metadata: {
                memberFirstName,
                matchFirstName,
                matchPhone,
                intelligenceBrief: args.matchIntelligenceBrief || item.matchIntelligenceBrief || "",
                outreachNotes: args.outreachNotes || "",
                declineInsight: "",
              },
            },
            startedAt: now,
            lastTransitionAt: now,
          });

          await ctx.db.insert("flowExecutionLogs", {
            instanceId,
            nodeId: "oc_start",
            nodeType: "start",
            action: "entered",
            output: JSON.stringify({
              flowName: "Outreach Continuation Flow",
              flowType: "outreach_continuation",
              outreachOutcome: args.outreachOutcome,
            }),
            timestamp: now,
          });

          await ctx.scheduler.runAfter(
            0,
            internal.engine.interpreter.advanceFlow,
            { flowInstanceId: instanceId }
          );
        }

        console.log(
          `[action-queue] Started outreach continuation flow (${args.outreachOutcome})`
        );
      } else {
        console.warn(
          `[action-queue] No outreach_continuation flow definition found — run seedOutreachContinuationFlow`
        );
      }
    }

    // Sync outreach outcome to SMA CRM
    if (item.matchId) {
      const OUTCOME_TO_SMA_STATUS: Record<string, string> = {
        match_interested: "active",     // stays active — outreach successful
        match_not_interested: "past",   // move to Past Introductions
        match_no_response: "active",    // stays active — still trying
      };

      const smaStatus = OUTCOME_TO_SMA_STATUS[args.outreachOutcome] || "active";
      const smaNote = [
        `Outreach outcome: ${args.outreachOutcome.replace(/_/g, " ")}`,
        args.outreachNotes ? `Notes: ${args.outreachNotes}` : "",
        args.matchIntelligenceBrief ? `Brief: ${args.matchIntelligenceBrief.slice(0, 300)}` : "",
      ].filter(Boolean).join("\n");

      await ctx.scheduler.runAfter(
        0,
        internal.integrations.smartmatchapp.actions.updateMatchInSma,
        {
          matchId: item.matchId,
          finalStatus: smaStatus,
          notes: smaNote,
        }
      );
    }

    return args.actionItemId;
  },
});

// ============================================================================
// setFollowUpDate — Schedule a check-back reminder
// ============================================================================

export const setFollowUpDate = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
    followUpDate: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new Error(`Action item not found: ${args.actionItemId}`);

    await ctx.db.patch(args.actionItemId, {
      followUpDate: args.followUpDate,
      updatedAt: Date.now(),
    });

    return args.actionItemId;
  },
});

// ============================================================================
// resolveItem — Mark an action item as resolved
// ============================================================================

export const resolveItem = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new Error(`Action item not found: ${args.actionItemId}`);

    const now = Date.now();
    const patch: Record<string, any> = {
      status: "resolved",
      resolvedAt: now,
      resolvedBy: admin._id,
      updatedAt: now,
    };

    if (args.adminNotes) {
      patch.outreachNotes = args.adminNotes;
    }

    await ctx.db.patch(args.actionItemId, patch);

    return args.actionItemId;
  },
});

// ============================================================================
// updateStatus — General status transition (pending → in_progress → resolved)
// ============================================================================

export const updateStatus = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("resolved"),
      v.literal("expired"),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new Error(`Action item not found: ${args.actionItemId}`);

    const now = Date.now();
    const patch: Record<string, any> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "resolved") {
      patch.resolvedAt = now;
      patch.resolvedBy = admin._id;
    }

    await ctx.db.patch(args.actionItemId, patch);

    return args.actionItemId;
  },
});

// ============================================================================
// updateIntelligenceBrief — Patch the match intelligence brief text
// ============================================================================

export const updateIntelligenceBrief = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
    matchIntelligenceBrief: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new Error(`Action item not found: ${args.actionItemId}`);

    await ctx.db.patch(args.actionItemId, {
      matchIntelligenceBrief: args.matchIntelligenceBrief,
      updatedAt: Date.now(),
    });

    return args.actionItemId;
  },
});

// ============================================================================
// updateIntelligenceBriefInternal — For AI action to store generated brief
// ============================================================================

export const updateIntelligenceBriefInternal = internalMutation({
  args: {
    actionItemId: v.id("actionQueue"),
    matchIntelligenceBrief: v.string(),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.actionItemId);
    if (!item) return;

    await ctx.db.patch(args.actionItemId, {
      matchIntelligenceBrief: args.matchIntelligenceBrief,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// requestIntelligenceBrief — Dashboard trigger for AI brief generation
// ============================================================================

export const requestIntelligenceBrief = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const item = await ctx.db.get(args.actionItemId);
    if (!item) throw new Error(`Action item not found: ${args.actionItemId}`);

    // Schedule the AI generation
    await ctx.scheduler.runAfter(
      0,
      internal.actionQueue.actions.generateIntelligenceBrief,
      { actionItemId: args.actionItemId }
    );

    return args.actionItemId;
  },
});

// ============================================================================
// startOutreachContinuationFlow — Internal, called by AI action after insight
// ============================================================================

export const startOutreachContinuationFlow = internalMutation({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
    matchId: v.id("matches"),
    memberId: v.id("members"),
    outreachOutcome: v.string(),
    memberFirstName: v.string(),
    matchFirstName: v.string(),
    matchPhone: v.string(),
    declineInsight: v.optional(v.string()),
    outreachNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const instanceId = await ctx.db.insert("flowInstances", {
      flowDefinitionId: args.flowDefinitionId,
      matchId: args.matchId,
      memberId: args.memberId,
      currentNodeId: "oc_start",
      status: "active",
      context: {
        responses: {},
        feedbackCategories: [],
        waitingForInput: false,
        timestamps: { flowStarted: now },
        outreachOutcome: args.outreachOutcome,
        metadata: {
          memberFirstName: args.memberFirstName,
          matchFirstName: args.matchFirstName,
          matchPhone: args.matchPhone,
          declineInsight: args.declineInsight || "",
          outreachNotes: args.outreachNotes || "",
        },
      },
      startedAt: now,
      lastTransitionAt: now,
    });

    await ctx.db.insert("flowExecutionLogs", {
      instanceId,
      nodeId: "oc_start",
      nodeType: "start",
      action: "entered",
      output: JSON.stringify({
        flowName: "Outreach Continuation Flow",
        flowType: "outreach_continuation",
        outreachOutcome: args.outreachOutcome,
        hasDeclineInsight: !!args.declineInsight,
      }),
      timestamp: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.engine.interpreter.advanceFlow,
      { flowInstanceId: instanceId }
    );

    console.log(
      `[action-queue] Started outreach continuation flow (${args.outreachOutcome}) with${args.declineInsight ? "" : "out"} decline insight`
    );
  },
});

// ============================================================================
// bumpPriority — Internal, used by cron to escalate aging items
// ============================================================================

export const bumpPriority = internalMutation({
  args: {
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.actionItemId);
    if (!item) return;
    if (item.priority === "urgent") return;

    await ctx.db.patch(args.actionItemId, {
      priority: "urgent",
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// expireStale — Internal, used by cron to auto-expire old pending items
// ============================================================================

export const expireStale = internalMutation({
  args: {
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.actionItemId);
    if (!item) return;
    if (item.status === "resolved" || item.status === "expired") return;

    await ctx.db.patch(args.actionItemId, {
      status: "expired",
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
