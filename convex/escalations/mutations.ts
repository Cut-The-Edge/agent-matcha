// @ts-nocheck
/**
 * Escalation Mutations
 *
 * Creates and manages escalation queue items. When a member's message
 * can't be handled automatically (unrecognized response, special request,
 * frustrated member, upsell purchase), an escalation is created and
 * Dani is notified via WhatsApp within 5 minutes.
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authz";

// ============================================================================
// createEscalation — Internal mutation to queue an escalation
// ============================================================================

export const createEscalation = internalMutation({
  args: {
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    flowInstanceId: v.optional(v.id("flowInstances")),
    issueType: v.union(
      v.literal("unrecognized_response"),
      v.literal("special_request"),
      v.literal("upsell_purchase"),
      v.literal("frustrated_member"),
      v.literal("manual"),
    ),
    issueDescription: v.string(),
    memberMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up member name
    const member = await ctx.db.get(args.memberId);
    const memberName = member
      ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
      : "Unknown Member";

    // Build match context string
    let matchContext: string | undefined;
    if (args.matchId) {
      const match = await ctx.db.get(args.matchId);
      if (match) {
        const otherMemberId =
          match.memberAId === args.memberId
            ? match.memberBId
            : match.memberAId;
        const otherMember = await ctx.db.get(otherMemberId);
        const otherName = otherMember
          ? `${otherMember.firstName}${otherMember.lastName ? ` ${otherMember.lastName}` : ""}`
          : "Unknown";
        matchContext = `Match with ${otherName} (status: ${match.status})`;
      }
    }

    const now = Date.now();

    const escalationId = await ctx.db.insert("escalations", {
      memberId: args.memberId,
      matchId: args.matchId,
      flowInstanceId: args.flowInstanceId,
      issueType: args.issueType,
      memberName,
      matchContext,
      issueDescription: args.issueDescription,
      memberMessage: args.memberMessage,
      status: "pending",
      notificationSent: false,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule WhatsApp notification to Dani within 5 minutes (300_000 ms).
    // We send immediately (0 delay) so Dani is alerted ASAP, well within 5 min.
    await ctx.scheduler.runAfter(
      0,
      internal.escalations.notify.notifyAdmin,
      { escalationId },
    );

    console.log(
      `[escalation] Created ${args.issueType} for ${memberName} (${escalationId})`,
    );

    return escalationId;
  },
});

// ============================================================================
// resolveEscalation — Mark an escalation as resolved (dashboard action)
// ============================================================================

export const resolveEscalation = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    escalationId: v.id("escalations"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);

    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) {
      throw new Error(`Escalation not found: ${args.escalationId}`);
    }

    await ctx.db.patch(args.escalationId, {
      status: "resolved",
      resolvedAt: Date.now(),
      resolvedBy: admin._id,
      adminNotes: args.adminNotes,
      updatedAt: Date.now(),
    });

    return args.escalationId;
  },
});

// ============================================================================
// updateEscalationStatus — Change status (pending -> in_progress -> resolved)
// ============================================================================

export const updateStatus = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    escalationId: v.id("escalations"),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("resolved"),
    ),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) {
      throw new Error(`Escalation not found: ${args.escalationId}`);
    }

    const patch: Record<string, any> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.adminNotes) {
      patch.adminNotes = args.adminNotes;
    }

    if (args.status === "resolved") {
      patch.resolvedAt = Date.now();
    }

    await ctx.db.patch(args.escalationId, patch);

    return args.escalationId;
  },
});

// ============================================================================
// markNotificationSent — Internal mutation after WhatsApp notification sent
// ============================================================================

export const markNotificationSent = internalMutation({
  args: {
    escalationId: v.id("escalations"),
  },
  handler: async (ctx, args) => {
    const escalation = await ctx.db.get(args.escalationId);
    if (!escalation) return;

    await ctx.db.patch(args.escalationId, {
      notificationSent: true,
      updatedAt: Date.now(),
    });
  },
});
