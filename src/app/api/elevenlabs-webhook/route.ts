import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/elevenlabs-webhook
 *
 * ElevenLabs post-call webhook handler.
 * Receives post_call_transcription events after each conversation ends.
 * Forwards transcript and metadata to Convex for AI summary generation and CRM sync.
 *
 * Configure this URL in ElevenLabs dashboard: Settings > Webhooks
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = body.type;

    console.log("[elevenlabs-webhook] Received event:", eventType);

    if (eventType === "post_call_transcription") {
      await handlePostCallTranscription(body.data);
    } else if (eventType === "call_initiation_failure") {
      await handleCallFailure(body.data);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[elevenlabs-webhook] Error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to prevent webhook disabling
  }
}

async function handlePostCallTranscription(data: {
  agent_id: string;
  conversation_id: string;
  transcript: Array<{
    role: "user" | "agent";
    message: string;
    time_in_call_secs: number;
    tool_calls?: Array<{ name: string; parameters: Record<string, unknown> }>;
    tool_results?: Array<{ result: string }>;
  }>;
  metadata: {
    start_time_unix_secs: number;
    call_duration_secs: number;
    cost?: number;
  };
  analysis?: {
    transcript_summary?: string;
    call_successful?: string;
    data_collection_results?: Array<{ name: string; value: string }>;
  };
  conversation_initiation_client_data?: {
    dynamic_variables?: Record<string, string>;
  };
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  if (!convexUrl) return;

  // Extract callId from dynamic variables (passed during outbound call or sandbox)
  const callId = data.conversation_initiation_client_data?.dynamic_variables?.convex_call_id;
  if (!callId) {
    console.log("[elevenlabs-webhook] No convex_call_id in dynamic variables — skipping");
    return;
  }

  // Convert ElevenLabs transcript to our format
  const transcript = data.transcript.map((turn) => ({
    speaker: turn.role === "user" ? "caller" : "agent",
    text: turn.message,
    timestamp: (data.metadata.start_time_unix_secs || 0) + (turn.time_in_call_secs || 0),
  }));

  // Stream transcript segments to Convex for real-time display
  for (const seg of transcript) {
    try {
      await fetch(`${convexUrl}/voice/transcript-segment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callId,
          speaker: seg.speaker,
          text: seg.text,
          timestamp: seg.timestamp,
        }),
      });
    } catch {
      // Non-fatal
    }
  }

  // Send call-ended to trigger AI summary generation
  const duration = data.metadata.call_duration_secs || 0;
  console.log(
    "[elevenlabs-webhook] Sending call-ended: callId=%s duration=%ds segments=%d",
    callId,
    duration,
    transcript.length,
  );

  await fetch(`${convexUrl}/voice/call-ended`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callId,
      duration,
      transcript,
      status: "completed",
    }),
  });
}

async function handleCallFailure(data: {
  agent_id: string;
  conversation_id: string;
  failure_reason: string;
  metadata?: {
    to_number?: string;
    sip_status_code?: number;
    error_reason?: string;
  };
}) {
  console.warn(
    "[elevenlabs-webhook] Call initiation failure: reason=%s to=%s sip=%d",
    data.failure_reason,
    data.metadata?.to_number,
    data.metadata?.sip_status_code,
  );

  // We could update the Convex call record to "failed" or "no_answer" here
  // but we'd need the callId from dynamic_variables which isn't available on failure events
}
