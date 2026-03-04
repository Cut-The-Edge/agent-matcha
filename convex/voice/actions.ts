// @ts-nocheck
import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "../integrations/openrouter/config";

/**
 * Generate an AI summary from a call transcript.
 * Called internally after a call ends.
 */
export const generateSummary = internalAction({
  args: {
    callId: v.id("phoneCalls"),
  },
  handler: async (ctx, args) => {
    // Fetch the call record
    const call = await ctx.runQuery(internal.voice.queries.getCallInternal, {
      callId: args.callId,
    });
    if (!call || !call.transcript) return;

    const transcript =
      typeof call.transcript === "string"
        ? call.transcript
        : call.transcript
            .map(
              (seg: { speaker: string; text: string }) =>
                `${seg.speaker === "agent" ? "Matcha" : "Caller"}: ${seg.text}`
            )
            .join("\n");

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getOpenRouterApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "system",
            content: `You are analyzing a phone intake call transcript for Club Allenby, a Jewish matchmaking service. Generate a structured JSON summary with these fields:
- "summary": A 2-3 sentence summary of the call
- "extractedFields": An object with ANY of these fields found in the conversation: firstName, lastName, age, location, hometown, willingToRelocate, ethnicity, occupation, familyInfo, jewishObservance, kosherLevel, shabbatObservance, relationshipHistory, lookingFor, physicalPreferences, ageRangePreference, mustHaves, dealbreakers, marriageTimeline, kidsPreference, dayInLife, hobbies
- "profileCompleteness": A percentage (0-100) of how complete the caller's profile is based on what was learned
- "recommendedNextSteps": An array of 1-3 recommended follow-up actions
- "sentiment": "positive", "neutral", or "negative" — the caller's overall sentiment
- "flags": An array of any concerns (e.g. "pricing_question", "hostile", "confused")

IMPORTANT: Extract as much profile data as possible from the transcript. This serves as a safety net — if the agent crashed before saving profile data, this extraction ensures nothing is lost. Be thorough.

Respond with ONLY valid JSON, no markdown.`,
          },
          {
            role: "user",
            content: `Transcript:\n\n${transcript}`,
          },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      console.error("AI summary generation failed:", response.statusText);
      return;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    let summary;
    try {
      summary = JSON.parse(content);
    } catch {
      summary = { summary: content, raw: true };
    }

    // Save summary and extracted data to the call record
    await ctx.runMutation(internal.voice.mutations.updateCall, {
      callId: args.callId,
      status: "completed",
      aiSummary: summary,
      extractedData: summary.extractedFields ?? undefined,
    });

    // Auto-flag quality issues
    const flags: string[] = [];
    if (call.duration && call.duration < 120) flags.push("short_call");
    if (call.status === "transferred") flags.push("transferred");
    if (summary.flags?.length > 0) flags.push(...summary.flags);

    if (flags.length > 0) {
      await ctx.runMutation(internal.voice.mutations.updateCall, {
        callId: args.callId,
        status: "completed",
        qualityFlags: flags,
      });
    }
  },
});

/**
 * Trigger an outbound call via LiveKit SIP.
 * Called from the dashboard to initiate a call to a member.
 */
export const triggerOutboundCall = action({
  args: {
    sessionToken: v.optional(v.string()),
    phone: v.string(),
    context: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // TODO: Use LiveKit Server SDK to create an agent dispatch
    // with the phone number in metadata. Requires livekit-server-sdk
    // npm package or direct API call.
    //
    // const dispatch = await livekitApi.agentDispatch.createDispatch({
    //   agentName: "matcha-intake-agent",
    //   room: `outbound-${Date.now()}`,
    //   metadata: JSON.stringify({
    //     phone_number: args.phone,
    //     context: args.context,
    //   }),
    // });

    console.log(`Outbound call requested to ${args.phone}`);
    return { status: "pending", message: "Outbound call dispatch not yet implemented" };
  },
});

/**
 * Sync call data to SmartMatchApp after a call.
 */
export const syncCallToSMA = internalAction({
  args: {
    callId: v.id("phoneCalls"),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.voice.mutations.updateSmaSyncStatus, {
      callId: args.callId,
      status: "pending",
    });

    // TODO: Implement actual SMA API sync when SMA client is built
    // For now, mark as pending
    console.log(`SMA sync pending for call ${args.callId}`);
  },
});
