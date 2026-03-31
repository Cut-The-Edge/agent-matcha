/**
 * ElevenLabs client-side tool handlers.
 *
 * Tool calls go through /api/elevenlabs-transcript proxy to avoid CORS.
 * The proxy forwards to Convex HTTP endpoints on .convex.site.
 */

/** Post to our Next.js proxy which forwards to Convex */
async function proxyPost(action: string, data: Record<string, unknown>) {
  const res = await fetch("/api/elevenlabs-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  if (!res.ok) {
    console.error(`[proxy] ${action} failed:`, res.status);
    return { ok: false, error: `HTTP ${res.status}` };
  }
  return res.json();
}

/** Post directly to our Next.js API routes (for tool calls that need Convex) */
async function convexViaProxy(path: string, data: Record<string, unknown>) {
  // Use a generic proxy approach - encode the path in the action
  const res = await fetch("/api/elevenlabs-transcript", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "proxy", path, ...data }),
  });
  if (!res.ok) {
    console.error(`[proxy] ${path} failed:`, res.status);
    return { ok: false };
  }
  return res.json();
}

/** Convert snake_case tool params to camelCase for Convex */
function snakeToCamel(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) continue;
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = val;
  }
  return result;
}

export interface ToolContext {
  callId: string | null;
  memberId: string | null;
  membershipPitchEnabled: boolean;
  membershipPitchPrompt: string;
  onPhaseChange?: (phase: number) => void;
  onCallEnd?: () => void;
}

/**
 * Create the client tools map for ElevenLabs Conversation.
 */
export function createClientTools(ctx: ToolContext) {
  return {
    save_intake_data: async (params: Record<string, unknown>) => {
      if (!ctx.callId) return "No active call — skipping save.";
      const data = snakeToCamel(params);
      console.log("[tool:save_intake_data] Saving", Object.keys(data).length, "fields");
      await convexViaProxy("/voice/save-intake-data", { callId: ctx.callId, data });
      return "Data saved successfully.";
    },

    save_deep_dive_data: async (params: Record<string, unknown>) => {
      if (!ctx.callId) return "No active call — skipping save.";
      const tags: Record<string, string> = {};
      for (const key of [
        "attachment_style", "communication_style", "energy_level",
        "life_stage", "emotional_maturity", "social_style",
        "love_language", "conflict_style",
      ]) {
        if (params[key]) tags[key] = String(params[key]);
      }
      await convexViaProxy("/voice/save-deep-dive", {
        callId: ctx.callId,
        data: {
          matchmakerNote: params.matchmaker_note || "",
          tags,
          conversationSummary: params.conversation_summary || "",
        },
      });
      ctx.onPhaseChange?.(2);
      return "Deep dive data saved successfully.";
    },

    send_data_request_link: async () => {
      if (!ctx.memberId) return "No member found — cannot send link.";
      const result = await convexViaProxy("/voice/send-data-request", {
        memberId: ctx.memberId,
      });
      return (result as Record<string, unknown>).alreadyPending
        ? "A form link was already pending — resent it."
        : "Form link sent via WhatsApp.";
    },

    start_deep_dive: async () => {
      ctx.onPhaseChange?.(2);
      if (ctx.callId) {
        await convexViaProxy("/voice/save-intake-data", {
          callId: ctx.callId,
          data: { phase2Started: true },
        });
      }
      return "Phase 2 activated. Transition naturally into the deeper conversation.";
    },

    start_membership_pitch: async () => {
      if (!ctx.membershipPitchEnabled) {
        return "Membership pitch is disabled. Skip to the normal wrap-up and end the call.";
      }
      ctx.onPhaseChange?.(3);
      return "Phase 3 activated. Transition naturally into the membership overview.";
    },

    end_call: async () => {
      ctx.onCallEnd?.();
      return "Call ended.";
    },
  };
}

/**
 * Stream a transcript segment to Convex via proxy.
 */
export async function streamTranscriptSegment(
  callId: string,
  speaker: "caller" | "agent",
  text: string,
) {
  await proxyPost("segment", {
    callId,
    speaker,
    text,
    timestamp: Date.now() / 1000,
  });
}

/**
 * Notify Convex that the call has ended via proxy.
 */
export async function notifyCallEnded(
  callId: string,
  duration: number,
  transcript: Array<{ speaker: string; text: string; timestamp: number }>,
  status: string = "completed",
) {
  await proxyPost("call-ended", {
    callId,
    duration,
    transcript,
    status,
  });

  // Log ElevenLabs cost estimate for sandbox calls
  // Sandbox calls are billed at half price: $0.05/min instead of $0.10/min
  const durationMinutes = duration / 60;
  const estimatedCost = durationMinutes * 0.05; // half price for testing
  await convexViaProxy("/voice/log-usage", {
    callId,
    durationSecs: duration,
    sttModel: "elevenlabs/scribe",
    llmModel: "elevenlabs/gpt-4.1-mini",
    ttsModel: "elevenlabs/flash-v2",
    userTokens: 0,
    agentTokens: 0,
    transcriptSegments: transcript.length,
    elevenlabsCostUsd: estimatedCost,
    elevenlabsMinutes: durationMinutes,
  }).catch(() => {});
}
