import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/elevenlabs-init
 *
 * Conversation initiation webhook — called by ElevenLabs when a new
 * conversation starts (phone or widget). Returns dynamic variables
 * that the agent can use, including callId and memberId for tool calls.
 *
 * ElevenLabs sends: { conversation_id, agent_id, ... }
 * We return: { dynamic_variables: { call_id, member_id, ... } }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("[elevenlabs-init] Conversation starting:", JSON.stringify(body).slice(0, 200));

    // Find the most recent in-progress call (registered by /api/twilio-voice)
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    let callId = "";
    let memberId = "";

    if (convexUrl) {
      // The twilio-voice webhook already registered the call.
      // We need to find it. Since this fires right after twilio-voice,
      // the most recent in_progress call is likely ours.
      // For a more robust solution, we could pass data via Twilio custom parameters.
    }

    // Return dynamic variables that tools can reference
    return NextResponse.json({
      dynamic_variables: {
        call_id: callId,
        member_id: memberId,
        conversation_id: body.conversation_id || "",
      },
    });
  } catch (error) {
    console.error("[elevenlabs-init] Error:", error);
    return NextResponse.json({ dynamic_variables: {} });
  }
}
