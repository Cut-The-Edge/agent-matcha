"use node";
// @ts-nocheck
/**
 * Pre-Approved WhatsApp Content Templates (Twilio Console)
 *
 * These are permanent, Meta-approved templates. They work outside the 24h
 * session window. NEVER create templates on-the-fly — use these instead.
 *
 * Each template has a ContentSid (assigned by Twilio) and a list of
 * variable names that must be resolved from the flow context before sending.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { toWhatsAppFormat } from "./config";

// ============================================================================
// Template Registry
// ============================================================================

export const WA_TEMPLATES = {
  // matcha_match_intro — "Hey {{1}}! 🎉 We found a new match for you. Here's their profile: {{2}}"
  // Buttons: "I'm interested" / "Not interested" / "More info / intro"
  MATCH_INTRO: {
    contentSid: "HX77524f0a50860e996b0e4811bd2e9ace",
    variables: ["memberName", "profileLink"],
  },

  // matcha_match_nudge — "Hey {{1}}, just checking in..."
  MATCH_NUDGE: {
    contentSid: "HX8715beeee12a1b184928bf9b5d90124b",
    variables: ["memberName"],
  },

  // matcha_match_decision — "Hey {{1}}, we think you and {{2}} could be a great match!"
  // Buttons: "I'm interested!" / "Not for me" / "Tell me more"
  MATCH_DECISION: {
    contentSid: "HXccf3eaee4c50958995cb2a1c48406967",
    variables: ["memberName", "matchName"],
  },

  // matcha_welcome — "Hey {{1}}! Welcome to Club Allenby..."
  WELCOME: {
    contentSid: "HXc0a86dde028e42b5678481fedc0151d2",
    variables: ["memberName"],
  },

  // matcha_match_expired — "Hey {{1}}, we noticed you haven't had a chance..."
  MATCH_EXPIRED: {
    contentSid: "HX6d2e86534a07b302c1d68c7768f99f81",
    variables: ["memberName"],
  },

  // ── No-Response Follow-Up Sequence Templates ──────────────────────

  // matcha_followup_day2 — "Just checking in on the introduction I sent over for {{1}}..."
  // Buttons: "I'm interested" / "Not interested" / "More info / intro"
  FOLLOWUP_DAY2: {
    contentSid: "HX3c75f62c4a8e5f360a17016b537a5baf",
    variables: ["matchName"],
  },

  // matcha_followup_day5 — "Circling back on {{1}}..."
  // Buttons: "I'm interested" / "Not interested" / "More info / intro"
  FOLLOWUP_DAY5: {
    contentSid: "HX1a079ddc4be6533b9e87194143abf4e6",
    variables: ["matchName"],
  },

  // matcha_followup_day7 — "Quick final check on {{1}}..."
  // Buttons: "I'm interested" / "Not interested" / "More info / intro"
  FOLLOWUP_DAY7: {
    contentSid: "HX49018ea5565668959f54bcfba0430e8b",
    variables: ["matchName"],
  },

  // matcha_followup_expired — "Since I didn't hear back, I've moved {{1}} to Past Introductions..."
  FOLLOWUP_EXPIRED: {
    contentSid: "HX52392dda25612bdaf50408339145f59b",
    variables: ["matchName"],
  },

  // matcha_midflow_expired — "No worries — since I haven't heard back, I'll close this out..."
  MIDFLOW_EXPIRED: {
    contentSid: "HXa9cee23b0b7409414934114a4ff5c155",
    variables: ["matchName"],
  },

  // ── Not-Interested Feedback Flow Templates ──────────────────────

  // matcha_feedback_closing — "Got it {{1}}! That's helpful. We'll refine your
  // preferences accordingly and circle back with your next match..."
  // Variables: {{1}} = member first name
  FEEDBACK_CLOSING: {
    contentSid: "HXc31a71cbef8869ca862fd4edd87786fb",
    variables: ["memberName"],
  },

  // matcha_recalibration_offer — "I want to pause before sending another profile.
  // After three declines, it's usually helpful to recalibrate together..."
  // Variables: {{1}} = booking link
  RECALIBRATION_OFFER: {
    contentSid: "HX558b25f396d087373d355405b30c83e6",
    variables: ["recalibrationLink"],
  },

  // ── Payment Confirmation Template ───────────────────────────────
  // Sent after Stripe webhook confirms payment — may be outside the
  // 24h session window, so a pre-approved template is required.

  // matcha_payment_confirmed — "Payment received — we'll initiate outreach shortly..."
  // Variables: none (static message)
  PAYMENT_CONFIRMED: {
    contentSid: "HXf14ab867acedc0ac82ae8e37cc98c021",
    variables: [] as const,
  },

  // ── Membership Lead Outcome Templates ────────────────────────────

  // club_allenby_lead_approved — "Hey {{1}}! Great news from Club Allenby!
  // Dani reviewed your profile and we'd love to welcome you to our {{2}} program.
  // She'll be reaching out personally to walk you through everything and get you set up.
  // Looking forward to finding you an amazing match!"
  // Variables: {{1}} = prospect name, {{2}} = tier label (Membership / VIP Matchmaking)
  LEAD_APPROVED: {
    contentSid: "HX400b21928ddce63a71f0960543593d7e",
    variables: ["prospectName", "tierLabel"],
  },

  // club_allenby_lead_denied — "Hey {{1}}, thanks so much for your interest in
  // Club Allenby's membership program! After reviewing your profile, we think the
  // best approach for you right now is to stay on our free matching tier..."
  // Variables: {{1}} = prospect name
  LEAD_DENIED: {
    contentSid: "HX46d359e1808a1046626e29c30bec88b4",
    variables: ["prospectName"],
  },

  // club_allenby_lead_expired — "Hey {{1}}, thanks for your interest in Club Allenby's
  // membership options! We wanted to follow up — our team has been busy but we haven't
  // forgotten about you. For now, you're on our free matching tier..."
  // Variables: {{1}} = prospect name
  LEAD_EXPIRED: {
    contentSid: "HX8f8054ae35aa32dd260a3f7b8326ea29",
    variables: ["prospectName"],
  },
  // ── Data Request Template ──────────────────────────────────────────

  // club_allenby_data_request — "Hey {{1}}! We're updating our records at
  // Club Allenby. Could you take a moment to fill in some missing details?
  // Here's your personal form: {{2}}"
  // Variables: {{1}} = member name, {{2}} = form link
  DATA_REQUEST: {
    contentSid: "HX2eb0e9de69bb00e192db576e4f0470d2",
    variables: ["memberName", "formLink"],
  },
} as const;

export type TemplateKey = keyof typeof WA_TEMPLATES;

// ============================================================================
// sendTemplateMessage — Send a pre-approved template via Twilio Messages API
// ============================================================================

export const sendTemplateMessage = internalAction({
  args: {
    to: v.string(),
    contentSid: v.string(),
    contentVariables: v.string(), // JSON string: {"1": "value1", "2": "value2"}
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER!;

    const authHeader =
      "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    const to = toWhatsAppFormat(args.to);
    const from = fromNumber.startsWith("whatsapp:")
      ? fromNumber
      : `whatsapp:${fromNumber}`;

    console.log(
      `[templates] Sending template ${args.contentSid} to ${to}`,
      "variables:", args.contentVariables
    );

    const messageParams = new URLSearchParams({
      To: to,
      From: from,
      ContentSid: args.contentSid,
      ContentVariables: args.contentVariables,
    });

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: messageParams.toString(),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(
          `[templates] Send failed (${response.status}):`,
          JSON.stringify(data)
        );
        return { twilioSid: null, status: "failed", interactive: false };
      }

      console.log(`[templates] Sent! SID=${data.sid}, status=${data.status}`);

      if (args.whatsappMessageId && data.sid) {
        await ctx.runMutation(
          internal.integrations.twilio.callbacks.updateMessageSid,
          { messageId: args.whatsappMessageId, twilioSid: data.sid }
        );
      }

      return {
        twilioSid: data.sid,
        status: data.status,
        contentSid: args.contentSid,
        interactive: true,
      };
    } catch (error: any) {
      console.error("[templates] Unexpected error:", error?.message || error);
      return { twilioSid: null, status: "failed", interactive: false };
    }
  },
});

// ============================================================================
// resolveTemplateVariables — Map flow context to Twilio template variables
// ============================================================================

/**
 * Resolves template variable names (e.g. ["memberName", "matchName"])
 * from the flow context into a Twilio ContentVariables JSON string.
 *
 * Twilio uses positional keys: {"1": "Alice", "2": "Bob"}
 */
export function resolveTemplateVariables(
  variableNames: readonly string[],
  context: Record<string, any>
): string {
  const variables: Record<string, string> = {};

  for (let i = 0; i < variableNames.length; i++) {
    const name = variableNames[i];
    // Check metadata first (memberFirstName, matchFirstName, etc.)
    const value =
      context.metadata?.[name] ??
      context.metadata?.[toFirstNameKey(name)] ??
      context[name] ??
      context[toFirstNameKey(name)] ??
      "";
    variables[String(i + 1)] = String(value);
  }

  return JSON.stringify(variables);
}

/**
 * Map generic variable names to firstName variants used in context.
 * e.g. "memberName" → "memberFirstName"
 */
function toFirstNameKey(key: string): string {
  if (key === "memberName") return "memberFirstName";
  if (key === "matchName") return "matchFirstName";
  return key;
}
