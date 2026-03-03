// @ts-nocheck
"use node";
/**
 * Deepgram Transcription Action
 *
 * Downloads the voice note from Twilio (requires auth), then sends the
 * audio binary to Deepgram Nova-2 for transcription. Routes the transcript
 * into the flow engine via handleMemberResponse.
 *
 * On failure, marks the message record with an error and sends a
 * "please type it out" fallback message to the member.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { DEEPGRAM_API_URL, getDeepgramApiKey } from "./config";

export const transcribeAndRoute = internalAction({
  args: {
    memberId: v.id("members"),
    mediaUrl: v.string(),
    mediaContentType: v.string(),
    twilioSid: v.optional(v.string()),
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
  },
  handler: async (ctx, args) => {
    console.log(
      `[deepgram] transcribeAndRoute called for member ${args.memberId}, mediaUrl: ${args.mediaUrl?.slice(0, 80)}...`
    );
    let transcript: string | null = null;

    try {
      const deepgramKey = getDeepgramApiKey();

      // Twilio media URLs require HTTP Basic Auth (AccountSid:AuthToken)
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;

      let audioBuffer: ArrayBuffer;
      let contentType = args.mediaContentType;

      if (twilioSid && twilioToken) {
        // Download audio from Twilio with authentication
        console.log(`[deepgram] Downloading audio from Twilio with auth...`);
        const mediaResponse = await fetch(args.mediaUrl, {
          headers: {
            Authorization:
              "Basic " +
              Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64"),
          },
        });

        if (!mediaResponse.ok) {
          throw new Error(
            `Failed to download Twilio media: ${mediaResponse.status} ${mediaResponse.statusText}`
          );
        }

        audioBuffer = await mediaResponse.arrayBuffer();
        // Use Twilio's content-type if available
        const responseContentType = mediaResponse.headers.get("content-type");
        if (responseContentType) {
          contentType = responseContentType;
        }
        console.log(
          `[deepgram] Downloaded ${audioBuffer.byteLength} bytes, content-type: ${contentType}`
        );
      } else {
        // Fallback: try URL-based transcription (works if media URL is public)
        console.log(`[deepgram] No Twilio credentials, trying URL-based transcription...`);
        const response = await fetch(DEEPGRAM_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ url: args.mediaUrl }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Deepgram API error ${response.status}: ${errorText.slice(0, 200)}`
          );
        }

        const data = await response.json();
        transcript =
          data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;

        if (!transcript || transcript.trim().length === 0) {
          throw new Error("Deepgram returned empty transcript");
        }

        transcript = transcript.trim();
        console.log(`[deepgram] Transcription success (URL mode): "${transcript}"`);
      }

      // If we downloaded the audio, send binary to Deepgram
      if (!transcript && audioBuffer!) {
        const response = await fetch(DEEPGRAM_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Token ${deepgramKey}`,
            "Content-Type": contentType || "audio/ogg",
          },
          body: audioBuffer,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Deepgram API error ${response.status}: ${errorText.slice(0, 200)}`
          );
        }

        const data = await response.json();
        transcript =
          data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || null;

        if (!transcript || transcript.trim().length === 0) {
          throw new Error("Deepgram returned empty transcript");
        }

        transcript = transcript.trim();
        console.log(`[deepgram] Transcription success (binary mode): "${transcript}"`);
      }
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown transcription error";
      console.error("Deepgram transcription failed:", errorMessage);

      // Mark the message record as failed
      if (args.whatsappMessageId) {
        await ctx.runMutation(
          internal.integrations.deepgram.callbacks.markTranscriptionFailed,
          { messageId: args.whatsappMessageId, error: errorMessage }
        );
      }

      // Send fallback "please type it out" message to member
      const member = await ctx.runQuery(
        internal.integrations.twilio.lookups.findMemberById,
        { memberId: args.memberId }
      );

      if (member) {
        const phone = member.whatsappId || member.phone;
        if (phone) {
          await ctx.runAction(
            internal.integrations.twilio.whatsapp.sendTextMessage,
            {
              to: phone,
              body: "Sorry, I couldn't process that voice note. Could you type out your response instead?",
            }
          );
        }
      }

      return;
    }

    // Success — update the message record with the transcription
    if (args.whatsappMessageId) {
      await ctx.runMutation(
        internal.integrations.deepgram.callbacks.updateTranscription,
        { messageId: args.whatsappMessageId, transcription: transcript }
      );
    }

    // Route the transcribed text into the flow engine
    await ctx.runMutation(
      internal.engine.transitions.handleMemberResponse,
      {
        memberId: args.memberId,
        response: transcript,
        twilioSid: args.twilioSid,
      }
    );
  },
});
