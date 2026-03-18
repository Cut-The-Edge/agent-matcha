import {
  RoomServiceClient,
  SipClient,
  AgentDispatchClient,
} from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/outbound-call
 *
 * Place an outbound phone call via LiveKit SIP.
 * Creates a room, dispatches the Matcha agent, then dials the target number.
 *
 * Body: { phone: string, context?: string, notes?: string, memberId?: string }
 *
 * Error handling for SIP failures:
 * - No answer / timeout
 * - Busy signal
 * - Voicemail detection
 * - Invalid number / call rejected
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

    // Clean phone number — ensure E.164 format (+1XXXXXXXXXX)
    let cleanPhone = phone.replace(/[^\d+]/g, "");
    // Strip leading + for digit processing, then re-add
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length === 10) {
      cleanPhone = `+1${digits}`; // US number without country code
    } else if (digits.length === 11 && digits.startsWith("1")) {
      cleanPhone = `+${digits}`; // US number with country code but no +
    } else if (!cleanPhone.startsWith("+")) {
      cleanPhone = `+${digits}`;
    }

    // Validate E.164 format
    if (!/^\+\d{10,15}$/.test(cleanPhone)) {
      return NextResponse.json(
        {
          error: "Invalid phone number format. Please use E.164 format (e.g. +14155551234).",
          code: "INVALID_NUMBER",
        },
        { status: 400 },
      );
    }

    const httpUrl = livekitUrl.replace("wss://", "https://");

    // 1. Create the room with a 5-minute empty timeout
    //    (auto-close if nobody joins within 5 min — protects against stuck rooms)
    const roomClient = new RoomServiceClient(httpUrl, apiKey, apiSecret);
    await roomClient.createRoom({
      name: roomName,
      emptyTimeout: 300, // 5 minutes
    });

    // 2. Dispatch the agent with metadata (agent connects first, before the call is placed)
    const metadata = JSON.stringify({
      phone_number: cleanPhone,
      direction: "outbound",
      context: callContext,
      agent_notes: agentNotes,
      member_id: memberId,
    });

    const dispatchClient = new AgentDispatchClient(httpUrl, apiKey, apiSecret);
    await dispatchClient.createDispatch(roomName, "matcha-intake-agent", {
      metadata,
    });

    // 3. Place the outbound SIP call (dial the phone)
    //    The SDK will wait for the callee to answer before returning.
    //    If they don't answer, it throws an error we handle below.
    const sipClient = new SipClient(httpUrl, apiKey, apiSecret);
    try {
      await sipClient.createSipParticipant(
        outboundTrunkId,
        cleanPhone,
        roomName,
        {
          participantIdentity: `sip_${cleanPhone}`,
          participantName: cleanPhone,
          // Wait up to 30 seconds for the callee to answer
          waitUntilAnswered: true,
        },
      );
    } catch (sipError: unknown) {
      // Clean up the room if the SIP call fails
      try {
        await roomClient.deleteRoom(roomName);
      } catch {
        // Room cleanup is best-effort
      }

      // Parse SIP-specific errors (TwirpError from LiveKit)
      const errMsg =
        sipError instanceof Error ? sipError.message : String(sipError);
      const errLower = errMsg.toLowerCase();

      if (
        errLower.includes("busy") ||
        errLower.includes("486")
      ) {
        return NextResponse.json(
          {
            error: "The line is busy. Try again in a few minutes.",
            code: "BUSY",
          },
          { status: 409 },
        );
      }

      if (
        errLower.includes("no answer") ||
        errLower.includes("timeout") ||
        errLower.includes("408") ||
        errLower.includes("480")
      ) {
        return NextResponse.json(
          {
            error: "No answer. The call was not picked up.",
            code: "NO_ANSWER",
          },
          { status: 408 },
        );
      }

      if (
        errLower.includes("rejected") ||
        errLower.includes("decline") ||
        errLower.includes("603")
      ) {
        return NextResponse.json(
          {
            error: "The call was declined by the recipient.",
            code: "DECLINED",
          },
          { status: 403 },
        );
      }

      if (
        errLower.includes("not found") ||
        errLower.includes("404") ||
        errLower.includes("unallocated") ||
        errLower.includes("invalid")
      ) {
        return NextResponse.json(
          {
            error: "Invalid or unreachable phone number.",
            code: "INVALID_NUMBER",
          },
          { status: 400 },
        );
      }

      // Generic SIP failure
      console.error("SIP call failed:", sipError);
      return NextResponse.json(
        {
          error: `Failed to connect the call: ${errMsg}`,
          code: "SIP_ERROR",
        },
        { status: 502 },
      );
    }

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
