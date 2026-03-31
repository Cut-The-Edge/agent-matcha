import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/outbound-call
 *
 * Place an outbound phone call via ElevenLabs native Twilio integration.
 * Uses the ElevenLabs outbound call API which handles the entire call lifecycle.
 *
 * Body: { phone: string, context?: string, notes?: string, memberId?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { phone, context, notes, memberId } = await req.json();

    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
    const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;

    if (!apiKey || !agentId || !phoneNumberId) {
      return NextResponse.json(
        { error: "ElevenLabs credentials not configured (need API key, agent ID, and phone number ID)" },
        { status: 500 },
      );
    }

    // Clean phone number — ensure E.164 format (+1XXXXXXXXXX)
    let cleanPhone = phone.replace(/[^\d+]/g, "");
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length === 10) {
      cleanPhone = `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith("1")) {
      cleanPhone = `+${digits}`;
    } else if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${digits}`;
    }

    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      return NextResponse.json(
        {
          error: "Invalid phone number format. Please use E.164 format (e.g. +14155551234).",
          code: "INVALID_NUMBER",
        },
        { status: 400 },
      );
    }

    // Register the call in Convex first to get a callId
    let callId: string | undefined;
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    if (convexUrl) {
      try {
        const callStartRes = await fetch(`${convexUrl}/voice/call-started`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            livekitRoomId: `elevenlabs-outbound-${Date.now()}`,
            phone: cleanPhone,
            direction: "outbound",
          }),
        });
        if (callStartRes.ok) {
          const callData = await callStartRes.json();
          callId = callData.callId;
        }
      } catch (e) {
        console.warn("Failed to register call in Convex:", e);
      }
    }

    // Place the outbound call via ElevenLabs native Twilio API
    const elRes = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: cleanPhone,
          conversation_initiation_client_data: {
            dynamic_variables: {
              phone_number: cleanPhone,
              direction: "outbound",
              context: context || "full_intake",
              agent_notes: notes || "",
              member_id: memberId || "",
              convex_call_id: callId || "",
            },
          },
        }),
      },
    );

    if (!elRes.ok) {
      const errData = await elRes.json().catch(() => ({}));
      const errMsg = errData.detail || errData.message || `ElevenLabs error ${elRes.status}`;
      console.error("ElevenLabs outbound call failed:", elRes.status, errData);

      // Map common errors
      if (elRes.status === 400) {
        return NextResponse.json(
          { error: errMsg, code: "INVALID_NUMBER" },
          { status: 400 },
        );
      }

      return NextResponse.json(
        { error: `Failed to connect the call: ${errMsg}`, code: "SIP_ERROR" },
        { status: 502 },
      );
    }

    const result = await elRes.json();

    return NextResponse.json({
      success: true,
      roomName: result.conversation_id || `outbound-${Date.now()}`,
      phone: cleanPhone,
      conversationId: result.conversation_id,
    });
  } catch (error: unknown) {
    console.error("Error placing outbound call:", error);
    const message =
      error instanceof Error ? error.message : "Failed to place call";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
