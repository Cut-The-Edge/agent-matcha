import {
  RoomServiceClient,
  SipClient,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { phone, context, notes } = await req.json();

    if (!phone) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 },
      );
    }

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const outboundTrunkId = "ST_Efsb4mXWhDgN";

    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 },
      );
    }

    // Parse context and notes
    let callContext = context || "full_intake";
    let agentNotes: string | undefined;
    if (callContext.includes(":")) {
      const parts = callContext.split(":");
      callContext = parts[0].trim();
      agentNotes = parts.slice(1).join(":").trim();
    }
    if (notes) {
      agentNotes = notes;
    }

    // Generate room name
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const roomName = `outbound-${timestamp}-${random}`;

    // Clean phone number — ensure E.164 format
    let cleanPhone = phone.replace(/[^\d+]/g, "");
    if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${cleanPhone}`;
    }

    const httpUrl = livekitUrl.replace("wss://", "https://");

    // 1. Create the room
    const roomClient = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await roomClient.createRoom({ name: roomName });

    // 2. Dispatch the agent with metadata
    const metadata = JSON.stringify({
      phone_number: cleanPhone,
      direction: "outbound",
      context: callContext,
      agent_notes: agentNotes,
    });

    const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
    await dispatchClient.createDispatch(roomName, "matcha-intake-agent", {
      metadata,
    });

    // 3. Place the outbound SIP call (dial the phone)
    const sipClient = new SipClient(httpUrl, apiKey, apiSecret);
    await sipClient.createSipParticipant(
      outboundTrunkId,
      cleanPhone,
      roomName,
      {
        participantIdentity: `sip_${cleanPhone}`,
        waitUntilAnswered: true,
      },
    );

    return NextResponse.json({
      success: true,
      roomName,
      phone: cleanPhone,
    });
  } catch (error: unknown) {
    console.error("Error placing outbound call:", error);
    const message =
      error instanceof Error ? error.message : "Failed to place call";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
