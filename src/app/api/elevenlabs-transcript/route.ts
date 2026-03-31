import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

/**
 * POST /api/elevenlabs-transcript
 *
 * Proxies all voice-related HTTP calls to Convex.
 * The browser can't call convex.site directly (CORS), so this acts as a relay.
 *
 * Body: { action: "segment" | "call-ended" | "proxy", path?, ... }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, path: proxyPath, ...data } = body;

    if (!CONVEX_SITE_URL) {
      return NextResponse.json({ error: "Convex not configured" }, { status: 500 });
    }

    // Determine the Convex endpoint path
    let convexPath: string;
    if (action === "segment") {
      convexPath = "/voice/transcript-segment";
    } else if (action === "call-ended") {
      convexPath = "/voice/call-ended";
    } else if (action === "proxy" && typeof proxyPath === "string" && proxyPath.startsWith("/voice/")) {
      convexPath = proxyPath;
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const res = await fetch(`${CONVEX_SITE_URL}${convexPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[transcript-proxy] ${convexPath} failed:`, res.status, errText);
      return NextResponse.json({ ok: false }, { status: res.status });
    }

    const result = await res.json();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[transcript-proxy] Error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
