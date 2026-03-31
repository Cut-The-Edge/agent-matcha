import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/elevenlabs-session
 *
 * Creates a signed ElevenLabs session AND registers the call in Convex.
 * All Convex HTTP calls happen server-side to avoid CORS issues.
 *
 * Body: { memberPhone?: string, memberName?: string, memberId?: string, sandbox?: boolean }
 * Returns: { signedUrl, agentId, callId, memberId, settings }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { memberPhone, memberName, memberId, sandbox } = body;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

    if (!apiKey || !agentId) {
      return NextResponse.json(
        { error: "ElevenLabs credentials not configured" },
        { status: 500 },
      );
    }

    // 1. Get signed URL from ElevenLabs
    const signedUrlRes = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      {
        method: "GET",
        headers: { "xi-api-key": apiKey },
      },
    );

    if (!signedUrlRes.ok) {
      const errText = await signedUrlRes.text();
      console.error("ElevenLabs signed URL error:", signedUrlRes.status, errText);
      return NextResponse.json(
        { error: `Failed to get signed URL: ${signedUrlRes.status}` },
        { status: 502 },
      );
    }

    const { signed_url: signedUrl } = await signedUrlRes.json();

    // 2. Register the call in Convex (server-side to avoid CORS)
    let callId: string | null = null;
    let member: Record<string, unknown> | null = null;
    let settings: Record<string, unknown> = {};

    const convexSiteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    if (convexSiteUrl) {
      try {
        const callStartRes = await fetch(`${convexSiteUrl}/voice/call-started`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            livekitRoomId: `elevenlabs-sandbox-${Date.now()}`,
            phone: memberPhone || undefined,
            direction: "inbound",
            sandbox: sandbox || false,
          }),
        });

        if (callStartRes.ok) {
          const callData = await callStartRes.json();
          callId = callData.callId;
          member = callData.member;
          settings = callData.settings || {};
          console.log("[elevenlabs-session] Call registered:", callId, "member:", member?.firstName);
        } else {
          console.error("[elevenlabs-session] call-started failed:", callStartRes.status);
        }
      } catch (e) {
        console.warn("[elevenlabs-session] Failed to register call:", e);
      }
    }

    return NextResponse.json({
      signedUrl,
      agentId,
      callId,
      memberId: (member as Record<string, unknown>)?._id || memberId || null,
      settings: {
        voiceAgentPrompt: (settings as Record<string, unknown>)?.voiceAgentPrompt || "",
        membershipPitchEnabled: (settings as Record<string, unknown>)?.membershipPitchEnabled ?? true,
        membershipPitchPrompt: (settings as Record<string, unknown>)?.membershipPitchPrompt || "",
      },
    });
  } catch (error) {
    console.error("Error creating ElevenLabs session:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 },
    );
  }
}
