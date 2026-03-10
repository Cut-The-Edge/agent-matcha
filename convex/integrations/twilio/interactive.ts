"use node";
// @ts-nocheck
/**
 * Twilio Interactive WhatsApp Messages
 *
 * Two modes:
 * 1. Template mode — Send a pre-approved Content Template via ContentSid.
 *    Works outside the 24h session window. No template creation needed.
 * 2. Session mode — Send numbered text fallback within the 24h window.
 *    No junk templates are created.
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

    // ── Template mode: send pre-approved template directly ──────────────
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
          // Fall through to numbered text fallback
          return await sendFallbackNumbered(
            ctx,
            args,
            authHeader,
            from,
            to
          );
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
        return await sendFallbackNumbered(ctx, args, authHeader, from, to);
      }
    }

    // ── Session mode: numbered text fallback (no junk templates) ────────
    console.log(
      `[interactive] Session mode: sending numbered text to ${to}, options: ${args.options.length}`
    );
    return await sendFallbackNumbered(ctx, args, authHeader, from, to);
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

  // Filter out system options
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
