import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/twilio-voice
 *
 * Twilio voice webhook — intercepts inbound calls BEFORE they reach ElevenLabs.
 * 1. Registers the call in Convex (so it shows in the dashboard immediately)
 * 2. Returns TwiML that redirects to ElevenLabs' inbound handler
 *
 * This gives us real-time visibility into phone calls while ElevenLabs
 * handles the actual conversation.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";
    const callSid = formData.get("CallSid")?.toString() || "";
    const callStatus = formData.get("CallStatus")?.toString() || "";

    console.log(`[twilio-voice] Inbound call: from=${from} to=${to} sid=${callSid} status=${callStatus}`);

    // Register the call in Convex so it shows in the dashboard immediately
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
    if (convexUrl) {
      try {
        const res = await fetch(`${convexUrl}/voice/call-started`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            livekitRoomId: `elevenlabs-phone-${callSid}`,
            phone: from,
            direction: "inbound",
            sipCallId: callSid,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[twilio-voice] Call registered: callId=${data.callId}`);
        }
      } catch (e) {
        console.warn("[twilio-voice] Failed to register call:", e);
      }
    }

    // Redirect to ElevenLabs to handle the actual conversation
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">https://api.elevenlabs.io/twilio/inbound_call</Redirect>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error("[twilio-voice] Error:", error);
    // Fallback — redirect to ElevenLabs anyway so the call doesn't fail
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect method="POST">https://api.elevenlabs.io/twilio/inbound_call</Redirect>
</Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
