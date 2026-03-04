import { AccessToken, RoomAgentDispatch, RoomConfiguration } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { memberPhone, memberName, roomName } = await req.json();

    if (!memberPhone || !roomName) {
      return NextResponse.json(
        { error: "memberPhone and roomName are required" },
        { status: 400 },
      );
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return NextResponse.json(
        { error: "LiveKit credentials not configured" },
        { status: 500 },
      );
    }

    const identity = `dashboard-${Date.now()}`;
    const participantName = memberName || "Dashboard Operator";

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: participantName,
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    at.roomConfig = new RoomConfiguration({
      agents: [
        new RoomAgentDispatch({
          agentName: "matcha-intake-agent",
          metadata: JSON.stringify({ phone_number: memberPhone, sandbox: true }),
        }),
      ],
    });

    const token = await at.toJwt();

    return NextResponse.json({ token, roomName });
  } catch (error) {
    console.error("Error generating LiveKit token:", error);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  }
}
