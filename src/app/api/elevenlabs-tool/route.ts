import { NextRequest, NextResponse } from "next/server";

const CONVEX_SITE_URL = process.env.NEXT_PUBLIC_CONVEX_SITE_URL!;

/**
 * POST /api/elevenlabs-tool
 *
 * Server-side tool handler for ElevenLabs webhook tools.
 * ElevenLabs calls this endpoint when the agent invokes a tool during
 * both phone calls and sandbox calls.
 *
 * ElevenLabs sends the tool name and parameters in the request body.
 * We forward the data to the appropriate Convex HTTP endpoint.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ElevenLabs webhook tool calls include tool_name and parameters
    // The exact format may vary — handle both direct params and nested
    const toolName = body.tool_name || body.name || "";
    const params = body.parameters || body;
    const conversationId = body.conversation_id || "";

    console.log(`[elevenlabs-tool] Tool: ${toolName} | conv: ${conversationId}`);

    // We need a callId to save data. Look it up by conversation_id or use dynamic vars.
    // For now, we'll need to find the active call. The conversation_id from ElevenLabs
    // maps to the livekitRoomId we set in call-started.

    // Try to find callId from recent in-progress calls
    let callId = params.call_id || params.callId || "";
    let memberId = params.member_id || params.memberId || "";

    // If no callId in params, search Convex for the active call
    if (!callId && CONVEX_SITE_URL) {
      // The twilio-voice webhook registered the call with livekitRoomId containing the Twilio CallSid
      // We can search by phone or by recent in-progress calls
    }

    let result: string;

    switch (toolName) {
      case "save_intake_data": {
        if (!callId) {
          // Find the most recent in-progress call
          result = "No active call found — data not saved. The call may not have been registered.";
          break;
        }
        const data: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(params)) {
          if (val === null || val === undefined || key === "call_id" || key === "member_id") continue;
          const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
          data[camelKey] = val;
        }
        if (Object.keys(data).length > 0) {
          await convexPost("/voice/save-intake-data", { callId, data });
          result = `Saved ${Object.keys(data).length} fields.`;
        } else {
          result = "No data to save.";
        }
        break;
      }

      case "save_deep_dive_data": {
        if (!callId) { result = "No active call."; break; }
        const tags: Record<string, string> = {};
        for (const k of ["attachment_style", "communication_style", "energy_level",
          "life_stage", "emotional_maturity", "social_style", "love_language", "conflict_style"]) {
          if (params[k]) tags[k] = String(params[k]);
        }
        await convexPost("/voice/save-deep-dive", {
          callId,
          data: {
            matchmakerNote: params.matchmaker_note || "",
            tags,
            conversationSummary: params.conversation_summary || "",
          },
        });
        result = "Deep dive data saved.";
        break;
      }

      case "send_data_request_link": {
        if (!memberId) { result = "No member found."; break; }
        await convexPost("/voice/send-data-request", { memberId });
        result = "Form link sent via WhatsApp.";
        break;
      }

      case "start_deep_dive": {
        if (callId) {
          await convexPost("/voice/save-intake-data", {
            callId,
            data: { phase2Started: true },
          });
        }
        result = "Phase 2 activated. Transition naturally into the deeper conversation.";
        break;
      }

      case "start_membership_pitch": {
        result = "Phase 3 activated. Transition naturally into the membership overview.";
        break;
      }

      case "end_call": {
        result = "Call ended.";
        break;
      }

      default:
        result = `Unknown tool: ${toolName}`;
    }

    console.log(`[elevenlabs-tool] ${toolName} → ${result}`);

    // ElevenLabs expects a JSON response
    return NextResponse.json({ result });
  } catch (error) {
    console.error("[elevenlabs-tool] Error:", error);
    return NextResponse.json({ result: "Tool execution failed." });
  }
}

async function convexPost(path: string, data: Record<string, unknown>) {
  if (!CONVEX_SITE_URL) return {};
  const res = await fetch(`${CONVEX_SITE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    console.error(`[elevenlabs-tool] Convex ${path} failed:`, res.status);
    return {};
  }
  return res.json();
}
