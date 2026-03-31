import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/elevenlabs-sync-prompt
 *
 * Syncs the voice agent system prompt from the dashboard to the ElevenLabs agent.
 * Called when the user saves a new prompt in Settings > Voice Prompt.
 * This ensures phone calls (which go directly to ElevenLabs) use the latest prompt.
 *
 * Body: { prompt: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;

    if (!apiKey || !agentId) {
      return NextResponse.json(
        { error: "ElevenLabs credentials not configured" },
        { status: 500 },
      );
    }

    // Update the ElevenLabs agent's system prompt
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
      {
        method: "PATCH",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversation_config: {
            agent: {
              prompt: {
                prompt: prompt || "",
              },
            },
          },
        }),
      },
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error("[elevenlabs-sync-prompt] Failed:", res.status, errData);
      return NextResponse.json(
        { error: `Failed to sync prompt: ${res.status}` },
        { status: 502 },
      );
    }

    console.log("[elevenlabs-sync-prompt] Prompt synced to ElevenLabs (%d chars)", (prompt || "").length);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[elevenlabs-sync-prompt] Error:", error);
    return NextResponse.json({ error: "Failed to sync" }, { status: 500 });
  }
}
