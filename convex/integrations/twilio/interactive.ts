"use node";
// @ts-nocheck
/**
 * Twilio Interactive WhatsApp Messages
 *
 * Three modes (in priority order):
 * 1. Template mode — Send a pre-approved Content Template via ContentSid.
 *    Works outside the 24h session window (business-initiated).
 * 2. Session mode — Dynamically create a quick-reply or list-picker Content
 *    template on-the-fly. Works within the 24h session window, no approval needed.
 * 3. Numbered text fallback — Plain text with 1./2./3. options if all else fails.
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
    // Template mode: pass these to send a pre-approved template directly
    contentSid: v.optional(v.string()),
    contentVariables: v.optional(v.string()),
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

    // ── Mode 1: Pre-approved template (business-initiated / outside 24h) ──
    if (args.contentSid) {
      console.log(
        `[interactive] Template mode: sending ${args.contentSid} to ${to}`
      );

      const messageParams = new URLSearchParams({
        To: to,
        From: from,
        ContentSid: args.contentSid,
        ...(args.contentVariables
          ? { ContentVariables: args.contentVariables }
          : {}),
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
            `[interactive] Template send failed (${response.status}):`,
            JSON.stringify(data)
          );
          // Fall through to dynamic session template
          return await sendDynamicSessionTemplate(ctx, args, authHeader, from, to, accountSid);
        }

        console.log(
          `[interactive] Template sent! SID=${data.sid}, status=${data.status}`
        );

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
        console.error(
          "[interactive] Template send error:",
          error?.message || error
        );
        return await sendDynamicSessionTemplate(ctx, args, authHeader, from, to, accountSid);
      }
    }

    // ── Mode 2: Dynamic session template (within 24h window) ────────────
    console.log(
      `[interactive] Session mode: creating dynamic template for ${to}, options: ${args.options.length}`
    );
    return await sendDynamicSessionTemplate(ctx, args, authHeader, from, to, accountSid);
  },
});

/**
 * Create a dynamic Twilio Content template on-the-fly and send it.
 * Uses twilio/quick-reply for ≤3 options (buttons),
 * twilio/list-picker for 4–10 options (list menu).
 * Falls back to numbered text if Content API fails.
 */
async function sendDynamicSessionTemplate(
  ctx: any,
  args: any,
  authHeader: string,
  from: string,
  to: string,
  accountSid: string
) {
  const userOptions = (args.options || []).filter(
    (opt: any) =>
      !opt.value.includes("no_response") &&
      !opt.label.toLowerCase().includes("(system)")
  );
  const options = userOptions.slice(0, 10);
  const useButtons = options.length <= 3;
  const uniqueName = `matcha_${useButtons ? "qr" : "lp"}_${Date.now()}`;

  // Numbered text used as twilio/text fallback inside the content template
  const numberedText = options
    .map((opt: any, i: number) => `${i + 1}. ${opt.label}`)
    .join("\n");
  const fallbackBody = `${args.question}\n\n${numberedText}\n\nReply with a number to choose.`;

  const contentBody = useButtons
    ? {
        friendly_name: uniqueName,
        language: "en",
        variables: {},
        types: {
          "twilio/quick-reply": {
            body: args.question,
            actions: options.map((opt: any) => ({
              title: opt.label.length > 20 ? opt.label.slice(0, 20) : opt.label,
              id: opt.value,
            })),
          },
          "twilio/text": { body: fallbackBody },
        },
      }
    : {
        friendly_name: uniqueName,
        language: "en",
        variables: {},
        types: {
          "twilio/list-picker": {
            body: args.question,
            button: "Choose an option",
            items: options.map((opt: any) => ({
              id: opt.value,
              item: opt.label.length > 24 ? opt.label.slice(0, 24) : opt.label,
            })),
          },
          "twilio/text": { body: fallbackBody },
        },
      };

  console.log(
    `[interactive] Creating content template: ${uniqueName}, buttons: ${useButtons}, options: ${options.length}`
  );

  try {
    // Step 1: Create content template
    const contentResponse = await fetch("https://content.twilio.com/v1/Content", {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(contentBody),
    });

    if (!contentResponse.ok) {
      const errorText = await contentResponse.text();
      console.error(
        `[interactive] Content API failed (${contentResponse.status}):`,
        errorText
      );
      return await sendFallbackNumbered(ctx, args, authHeader, from, to, accountSid);
    }

    const contentData = await contentResponse.json();
    const contentSid = contentData.sid;
    console.log(`[interactive] Dynamic template created: ${contentSid}`);

    // Step 2: Send message with ContentSid
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
      console.error(
        `[interactive] Message send failed (${messageResponse.status}):`,
        errorText
      );
      return await sendFallbackNumbered(ctx, args, authHeader, from, to, accountSid);
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
    console.error("[interactive] Dynamic template error:", error?.message || error);
    return await sendFallbackNumbered(ctx, args, authHeader, from, to, accountSid);
  }
}

/**
 * Last-resort fallback: plain numbered text message.
 */
async function sendFallbackNumbered(
  ctx: any,
  args: any,
  authHeader: string,
  from: string,
  to: string,
  accountSid: string
) {
  const userOptions = (args.options || []).filter(
    (opt: any) =>
      !opt.value.includes("no_response") &&
      !opt.label.toLowerCase().includes("(system)")
  );

  const optionsText = userOptions
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
      console.error(
        `[interactive] Fallback failed (${response.status}):`,
        JSON.stringify(data)
      );
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
