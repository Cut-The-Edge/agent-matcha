"use node";
// @ts-nocheck
/**
 * Action Queue Notification
 *
 * Sends WhatsApp notifications to Dani (admin) when action items are
 * created or aging. Follows the same pattern as escalations/notify.ts.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// ============================================================================
// Type labels for human-readable notifications
// ============================================================================

const TYPE_LABELS: Record<string, string> = {
  outreach_needed: "Outreach Needed",
  outreach_pending: "Outreach Pending",
  follow_up_reminder: "Follow-up Reminder",
  payment_pending: "Payment Pending",
  recalibration_due: "Recalibration Due",
  unrecognized_response: "Unrecognized Response",
  frustrated_member: "Frustrated Member",
};

// ============================================================================
// notifyAdmin — Send WhatsApp notification to Dani for new action items
// ============================================================================

export const notifyAdmin = internalAction({
  args: {
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    // Read the action item
    const item = await ctx.runQuery(
      internal.actionQueue.queries.getByIdInternal,
      { actionItemId: args.actionItemId }
    );

    if (!item) {
      console.error(`[action-queue-notify] Item ${args.actionItemId} not found`);
      return;
    }

    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (!adminPhone) {
      console.error("[action-queue-notify] ADMIN_WHATSAPP_NUMBER env var not set");
      return;
    }

    // Look up member name
    const member = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: item.memberId }
    );
    const memberName = member
      ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
      : "Unknown";

    // Look up match partner name
    let matchPartnerName = "";
    if (item.matchId) {
      const match = await ctx.runQuery(
        internal.matches.queries.getInternal,
        { matchId: item.matchId }
      );
      if (match) {
        const partnerId =
          match.memberAId === item.memberId
            ? match.memberBId
            : match.memberAId;
        const partner = await ctx.runQuery(
          internal.members.queries.getByIdInternal,
          { memberId: partnerId }
        );
        matchPartnerName = partner
          ? `${partner.firstName}${partner.lastName ? ` ${partner.lastName}` : ""}`
          : "Unknown";
      }
    }

    // Build notification message
    const typeLabel = TYPE_LABELS[item.type] || item.type;
    const lines = [
      `--- Action Queue ---`,
      ``,
      `Type: ${typeLabel}`,
      `Priority: ${item.priority.toUpperCase()}`,
      `Member: ${memberName}`,
    ];

    if (matchPartnerName) {
      lines.push(`Match: ${matchPartnerName}`);
    }

    if (item.context?.paymentAmount) {
      lines.push(`Payment: $${(item.context.paymentAmount / 100).toFixed(2)}`);
    }

    lines.push(
      ``,
      `Time: ${new Date(item.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" })}`,
      ``,
      `View in dashboard: /dashboard/actions`
    );

    const body = lines.join("\n");

    try {
      await ctx.runAction(
        internal.integrations.twilio.whatsapp.sendTextMessage,
        { to: adminPhone, body }
      );

      console.log(
        `[action-queue-notify] Sent ${typeLabel} notification (${args.actionItemId})`
      );
    } catch (error: any) {
      console.error(
        `[action-queue-notify] Failed to send notification:`,
        error?.message || error
      );
    }
  },
});

// ============================================================================
// notifyAging — Re-notify for items pending > 48 hours
// ============================================================================

export const notifyAging = internalAction({
  args: {
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(
      internal.actionQueue.queries.getByIdInternal,
      { actionItemId: args.actionItemId }
    );

    if (!item || item.status === "resolved" || item.status === "expired") {
      return;
    }

    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (!adminPhone) {
      console.error("[action-queue-notify] ADMIN_WHATSAPP_NUMBER env var not set");
      return;
    }

    const hoursAgo = Math.round((Date.now() - item.createdAt) / (1000 * 60 * 60));
    const typeLabel = TYPE_LABELS[item.type] || item.type;

    const body = [
      `--- Action Reminder ---`,
      ``,
      `Pending ${typeLabel} has been waiting ${hoursAgo}h.`,
      `Priority has been bumped to URGENT.`,
      ``,
      `View in dashboard: /dashboard/actions`,
    ].join("\n");

    try {
      await ctx.runAction(
        internal.integrations.twilio.whatsapp.sendTextMessage,
        { to: adminPhone, body }
      );

      console.log(
        `[action-queue-notify] Sent aging reminder for ${args.actionItemId} (${hoursAgo}h old)`
      );
    } catch (error: any) {
      console.error(
        `[action-queue-notify] Failed to send aging notification:`,
        error?.message || error
      );
    }
  },
});
