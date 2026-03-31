import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/pitch-arena-call
 *
 * Initiate a Pitch Arena call via ElevenLabs native Twilio outbound API.
 *
 * Note: Pitch Arena is a human-to-human call feature where Dani calls matches.
 * With ElevenLabs, this places an outbound call with the AI agent handling
 * the initial connection and transcription. For pure human-to-human calling
 * without an AI agent, a different solution (e.g., Twilio Client SDK) would
 * be needed.
 *
 * Body: { phone: string, matchName?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { phone, matchName } = await req.json();

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
        { error: "ElevenLabs credentials not configured" },
        { status: 500 },
      );
    }

    // Clean phone number
    let cleanPhone = phone.replace(/[^\d+]/g, "");
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length === 10) cleanPhone = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith("1")) cleanPhone = `+${digits}`;
    else if (!cleanPhone.startsWith("+")) cleanPhone = `+${digits}`;

    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      return NextResponse.json(
        { error: "Invalid phone number format.", code: "INVALID_NUMBER" },
        { status: 400 },
      );
    }

    // Place outbound call via ElevenLabs
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
              context: "pitch_arena",
              match_name: matchName || "",
            },
          },
        }),
      },
    );

    if (!elRes.ok) {
      const errData = await elRes.json().catch(() => ({}));
      const errMsg = errData.detail || errData.message || `Error ${elRes.status}`;

      return NextResponse.json(
        { error: `Failed to connect: ${errMsg}`, code: "SIP_ERROR" },
        { status: 502 },
      );
    }

    const result = await elRes.json();
    return NextResponse.json({
      success: true,
      token: "",
      roomName: result.conversation_id || `pitch-${Date.now()}`,
      phone: cleanPhone,
    });
  } catch (error: unknown) {
    console.error("Error in pitch-arena-call:", error);
    const message =
      error instanceof Error ? error.message : "Failed to place call";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
