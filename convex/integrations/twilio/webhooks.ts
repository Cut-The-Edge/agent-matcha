// @ts-nocheck
/**
 * Twilio Inbound Webhook Handler
 *
 * Receives incoming WhatsApp messages from Twilio, looks up the member,
 * and routes the message to the flow engine via handleMemberResponse.
 *
 * Twilio sends form-encoded POST bodies with fields like:
 *   From, Body, MessageSid, To, NumMedia, etc.
 */

import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { fromWhatsAppFormat } from "./config";

/**
 * POST /twilio/webhook
 *
 * Processing chain:
 * 1. Parse Twilio form-encoded body → extract From, Body, MessageSid
 * 2. Normalize phone number → look up member by whatsappId or phone
 * 3. If member found → call handleMemberResponse to advance flow
 * 4. Return 200 with empty TwiML so Twilio doesn't retry
 */
export const twilioWebhookHandler = httpAction(async (ctx, request) => {
  try {
    // Parse form-encoded body
    const formData = await request.formData();
    const from = formData.get("From") as string | null;
    const body = formData.get("Body") as string | null;
    const messageSid = formData.get("MessageSid") as string | null;

    // Parse media fields (voice notes, images, etc.)
    const numMediaRaw = formData.get("NumMedia") as string | null;
    const numMedia = parseInt(numMediaRaw || "0", 10);
    const mediaUrl0 = formData.get("MediaUrl0") as string | null;
    const mediaContentType0 = formData.get("MediaContentType0") as string | null;

    // Debug: log all media-related fields for every inbound message
    console.log(
      `[webhook] from=${from}, body=${body ? `"${body.slice(0, 50)}"` : "null"}, ` +
      `numMedia=${numMediaRaw}→${numMedia}, mediaUrl0=${mediaUrl0 ? "yes" : "null"}, ` +
      `contentType=${mediaContentType0}`
    );

    // Detect voice note: has audio media and possibly no text body
    const isAudio =
      numMedia >= 1 &&
      mediaContentType0?.startsWith("audio/") &&
      !!mediaUrl0;

    if (!from || (!body && !isAudio)) {
      console.warn("Twilio webhook: missing From, and no Body or audio media");
      return new Response(twimlEmpty(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    // Normalize phone: "whatsapp:+1234567890" → "+1234567890"
    const phone = fromWhatsAppFormat(from);

    // Look up member by whatsappId first, then by phone
    let member = await ctx.runQuery(
      internal.integrations.twilio.lookups.findMemberByWhatsApp,
      { whatsappId: from }
    );

    if (!member) {
      member = await ctx.runQuery(
        internal.integrations.twilio.lookups.findMemberByPhone,
        { phone }
      );
    }

    if (!member) {
      console.warn(`Twilio webhook: no member found for ${phone}`);
      return new Response(twimlEmpty(), {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }

    if (isAudio) {
      // Voice note branch: log media message + schedule async transcription
      console.log(`[webhook] Voice note detected! Scheduling transcription for member ${member._id}`);
      await ctx.runMutation(
        internal.integrations.deepgram.callbacks.logMediaAndScheduleTranscription,
        {
          memberId: member._id,
          mediaUrl: mediaUrl0!,
          mediaContentType: mediaContentType0!,
          twilioSid: messageSid || undefined,
        }
      );
    } else {
      // Text branch: existing behavior — route directly to flow engine
      await ctx.runMutation(
        internal.engine.transitions.handleMemberResponse,
        {
          memberId: member._id,
          response: body!.trim(),
          twilioSid: messageSid || undefined,
        }
      );
    }

    return new Response(twimlEmpty(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("Twilio webhook error:", error);
    // Always return 200 to prevent Twilio retries
    return new Response(twimlEmpty(), {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
});

/**
 * Return empty TwiML so Twilio doesn't send an auto-reply.
 */
function twimlEmpty(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}
