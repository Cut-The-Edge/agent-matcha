import {
  RoomServiceClient,
  SipClient,
  AccessToken,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/pitch-arena-call
 *
 * Initiate a Pitch Arena call: Dani speaks directly to a match via browser WebRTC.
 * 1. Creates a LiveKit room
 * 2. Generates a browser token for Dani (NO AI agent dispatch)
 * 3. Dials the match via SIP into the same room
 *
 * Body: { phone: string, matchName?: string }
 * Returns: { token, roomName, phone }
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

    const livekitUrl = process.env.LIVEKIT_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const outboundTrunkId =
      process.env.LIVEKIT_OUTBOUND_TRUNK_ID || "ST_BXjTydasn632";

    if (!livekitUrl || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 },
      );
    }

    // Clean phone number — ensure E.164 format
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
        { error: "Invalid phone number format.", code: "INVALID_NUMBER" },
        { status: 400 },
      );
    }

    const httpUrl = livekitUrl.replace("wss://", "https://");
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    const roomName = `pitch-arena-${timestamp}-${random}`;

    // 1. Create the room
    const roomClient = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await roomClient.createRoom({
      name: roomName,
      emptyTimeout: 300,
    });

    // 2. Dispatch transcription-only agent (listens + transcribes, no speaking)
    const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
    await dispatchClient.createDispatch(roomName, "matcha-intake-agent", {
      metadata: JSON.stringify({
        phone_number: cleanPhone,
        direction: "outbound",
        mode: "transcription_only",
      }),
    });

    // 3. Generate a browser token for Dani
    const identity = `dani-${timestamp}`;
    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: "Dani (Matchmaker)",
    });
    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });
    const token = await at.toJwt();

    // 4. Place the outbound SIP call
    const sipClient = new SipClient(httpUrl, apiKey, apiSecret);
    try {
      await sipClient.createSipParticipant(
        outboundTrunkId,
        cleanPhone,
        roomName,
        {
          participantIdentity: `sip_${cleanPhone}`,
          participantName: matchName || cleanPhone,
          waitUntilAnswered: true,
        },
      );
    } catch (sipError: unknown) {
      // Clean up room on SIP failure
      try {
        await roomClient.deleteRoom(roomName);
      } catch {
        // best-effort
      }

      const errMsg =
        sipError instanceof Error ? sipError.message : String(sipError);
      const errLower = errMsg.toLowerCase();

      if (errLower.includes("busy") || errLower.includes("486")) {
        return NextResponse.json(
          { error: "The line is busy. Try again in a few minutes.", code: "BUSY" },
          { status: 409 },
        );
      }
      if (errLower.includes("no answer") || errLower.includes("timeout") || errLower.includes("408") || errLower.includes("480")) {
        return NextResponse.json(
          { error: "No answer. The call was not picked up.", code: "NO_ANSWER" },
          { status: 408 },
        );
      }
      if (errLower.includes("rejected") || errLower.includes("decline") || errLower.includes("603")) {
        return NextResponse.json(
          { error: "The call was declined.", code: "DECLINED" },
          { status: 403 },
        );
      }
      if (errLower.includes("not found") || errLower.includes("404") || errLower.includes("invalid")) {
        return NextResponse.json(
          { error: "Invalid or unreachable phone number.", code: "INVALID_NUMBER" },
          { status: 400 },
        );
      }

      console.error("SIP call failed:", sipError);
      return NextResponse.json(
        { error: `Failed to connect: ${errMsg}`, code: "SIP_ERROR" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      token,
      roomName,
      phone: cleanPhone,
    });
  } catch (error: unknown) {
    console.error("Error in pitch-arena-call:", error);
    const message =
      error instanceof Error ? error.message : "Failed to place call";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
