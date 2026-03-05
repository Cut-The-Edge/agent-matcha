"use node";
// @ts-nocheck
/**
 * Twilio Interactive WhatsApp Messages
 *
 * "use node" enables full Node.js runtime (needed for Buffer, fetch, etc.)
 *
 * Sends real WhatsApp buttons (≤3 options) or list-pickers (>3 options)
 * via the Twilio Content API + Messages API.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { toWhatsAppFormat } from "./config";

export const sendInteractiveMessage = internalAction({
  args: {
    to: v.string(),
    question: v.string(),
    options: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
      })
    ),
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
  },
  handler: async (ctx, args) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER!;

    // Base64 auth — use btoa for broad runtime compat
    const authHeader =
      "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    // Ensure whatsapp: format (strips spaces/dashes for E.164)
    const to = toWhatsAppFormat(args.to);
    const from = fromNumber.startsWith("whatsapp:")
      ? fromNumber
      : `whatsapp:${fromNumber}`;

    // Filter out system options (like "No response") that shouldn't be buttons
    const userOptions = args.options.filter(
      (opt) => !opt.value.includes("no_response") && !opt.label.toLowerCase().includes("(system)")
    );
    const options = userOptions.slice(0, 10);
    const useButtons = options.length <= 3;
    const uniqueName = `matcha_${useButtons ? "qr" : "lp"}_${Date.now()}`;

    // Numbered text fallback
    const numberedText = options
      .map((opt, i) => `${i + 1}. ${opt.label}`)
      .join("\n");
    const fallbackBody = `${args.question}\n\n${numberedText}\n\nReply with a number to choose.`;

    // Build Content Template with twilio/text fallback
    let contentBody: Record<string, any>;

    if (useButtons) {
      contentBody = {
        friendly_name: uniqueName,
        language: "en",
        variables: {},
        types: {
          "twilio/quick-reply": {
            body: args.question,
            actions: options.map((opt) => ({
              title: opt.label.length > 20 ? opt.label.slice(0, 20) : opt.label,
              id: opt.value,
            })),
          },
          "twilio/text": {
            body: fallbackBody,
          },
        },
      };
    } else {
      contentBody = {
        friendly_name: uniqueName,
        language: "en",
        variables: {},
        types: {
          "twilio/list-picker": {
            body: args.question,
            button: "Choose an option",
            items: options.map((opt) => ({
              id: opt.value,
              item: opt.label.length > 24 ? opt.label.slice(0, 24) : opt.label,
            })),
          },
          "twilio/text": {
            body: fallbackBody,
          },
        },
      };
    }

    console.log("[interactive] Creating content template:", uniqueName, "buttons:", useButtons, "options:", options.length);

    try {
      // Step 1: Create content template
      const contentResponse = await fetch(
        "https://content.twilio.com/v1/Content",
        {
          method: "POST",
          headers: {
            Authorization: authHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(contentBody),
        }
      );

      if (!contentResponse.ok) {
        const errorText = await contentResponse.text();
        console.error(`[interactive] Content API failed (${contentResponse.status}):`, errorText);
        return await sendFallbackNumbered(ctx, args, authHeader, from, to);
      }

      const contentData = await contentResponse.json();
      const contentSid = contentData.sid;
      console.log(`[interactive] Template created: ${contentSid}`);

      // Step 2: Send with ContentSid (no approval needed for session messages)
      const messageParams = new URLSearchParams({
        To: to,
        From: from,
        ContentSid: contentSid,
      });

      const messageResponse = await fetch(
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

      if (!messageResponse.ok) {
        const errorText = await messageResponse.text();
        console.error(`[interactive] Message send failed (${messageResponse.status}):`, errorText);
        return await sendFallbackNumbered(ctx, args, authHeader, from, to);
      }

      const messageData = await messageResponse.json();
      console.log(`[interactive] Sent! SID=${messageData.sid}, status=${messageData.status}`);

      if (args.whatsappMessageId && messageData.sid) {
        await ctx.runMutation(
          internal.integrations.twilio.callbacks.updateMessageSid,
          { messageId: args.whatsappMessageId, twilioSid: messageData.sid }
        );
      }

      return {
        twilioSid: messageData.sid,
        status: messageData.status,
        contentSid,
        interactive: true,
      };
    } catch (error: any) {
      console.error("[interactive] Unexpected error:", error?.message || error);
      // Try fallback on any error
      return await sendFallbackNumbered(ctx, args, authHeader, from, to);
    }
  },
});

async function sendFallbackNumbered(
  ctx: any,
  args: any,
  authHeader: string,
  from: string,
  to: string
) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID!;

  const optionsText = args.options
    .map((opt: any, i: number) => `${i + 1}. ${opt.label}`)
    .join("\n");

  const body = `${args.question}\n\n${optionsText}\n\nReply with a number to choose.`;

  console.log(`[interactive] Fallback: sending numbered text to ${to}`);

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(`[interactive] Fallback failed (${response.status}):`, JSON.stringify(data));
    } else {
      console.log(`[interactive] Fallback sent: SID=${data.sid}`);
    }

    if (args.whatsappMessageId && data.sid) {
      await ctx.runMutation(
        internal.integrations.twilio.callbacks.updateMessageSid,
        { messageId: args.whatsappMessageId, twilioSid: data.sid }
      );
    }

    return { twilioSid: data.sid, status: data.status, interactive: false };
  } catch (error: any) {
    console.error("[interactive] Fallback crashed:", error?.message || error);
    return { twilioSid: null, status: "failed", interactive: false };
  }
}
