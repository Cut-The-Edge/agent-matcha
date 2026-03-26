import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * POST /api/pitch-arena-generate
 *
 * Trigger pitch generation for an active Pitch Arena session.
 * Schedules the LLM action via a Convex mutation.
 *
 * Body: { sessionId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json();

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId is required" },
        { status: 400 },
      );
    }

    await convex.mutation(api.pitchArena.mutations.triggerPitchGeneration, {
      sessionId,
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error triggering pitch generation:", error);
    const message =
      error instanceof Error ? error.message : "Failed to generate pitch";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
