"use node";
// @ts-nocheck
/**
 * Escalation Notification
 *
 * Sends a WhatsApp message to Dani (admin) when an escalation is created.
 * The notification includes member name, match context, and issue description
 * so Dani can take action without opening the dashboard.
 *
 * Dani's phone number is read from the ADMIN_WHATSAPP_NUMBER env var.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { toWhatsAppFormat } from "../integrations/twilio/config";

// ============================================================================
// Issue type labels for human-readable notifications
// ============================================================================

const ISSUE_TYPE_LABELS: Record<string, string> = {
  unrecognized_response: "Unrecognized Response",
  special_request: "Special Request",
  upsell_purchase: "Upsell Purchase",
  frustrated_member: "Frustrated Member",
  manual: "Manual Escalation",
};

// ============================================================================
// notifyAdmin — Send WhatsApp notification to Dani
// ============================================================================

export const notifyAdmin = internalAction({
  args: {
    escalationId: v.id("escalations"),
  },
  handler: async (ctx, args) => {
    // Read the escalation record
    const escalation = await ctx.runQuery(
      internal.escalations.queries.getByIdInternal,
      { escalationId: args.escalationId },
    );

    if (!escalation) {
      console.error(`[escalation-notify] Escalation ${args.escalationId} not found`);
      return;
    }

    // Skip if notification already sent (idempotency)
    if (escalation.notificationSent) {
      console.log(`[escalation-notify] Notification already sent for ${args.escalationId}`);
      return;
    }

    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (!adminPhone) {
      console.error("[escalation-notify] ADMIN_WHATSAPP_NUMBER env var not set");
      return;
    }

    // Build notification message
    const issueLabel = ISSUE_TYPE_LABELS[escalation.issueType] || escalation.issueType;
    const lines = [
      `--- Escalation Alert ---`,
      ``,
      `Type: ${issueLabel}`,
      `Member: ${escalation.memberName}`,
    ];

    if (escalation.matchContext) {
      lines.push(`Match: ${escalation.matchContext}`);
    }

    lines.push(``, `Issue: ${escalation.issueDescription}`);

    if (escalation.memberMessage) {
      const preview = escalation.memberMessage.length > 200
        ? escalation.memberMessage.slice(0, 200) + "..."
        : escalation.memberMessage;
      lines.push(``, `Member said: "${preview}"`);
    }

    lines.push(``, `Time: ${new Date(escalation.createdAt).toLocaleString("en-US", { timeZone: "America/New_York" })}`);

    const body = lines.join("\n");

    try {
      // Send via Twilio
      await ctx.runAction(
        internal.integrations.twilio.whatsapp.sendTextMessage,
        {
          to: adminPhone,
          body,
        },
      );

      // Mark notification as sent
      await ctx.runMutation(
        internal.escalations.mutations.markNotificationSent,
        { escalationId: args.escalationId },
      );

      console.log(
        `[escalation-notify] Sent ${issueLabel} notification for ${escalation.memberName}`,
      );
    } catch (error: any) {
      console.error(
        `[escalation-notify] Failed to send notification:`,
        error?.message || error,
      );
    }
  },
});
