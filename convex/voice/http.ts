// @ts-nocheck
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { calculateCostUsd } from "../analytics/pricingSync";

/**
 * POST /voice/call-started
 * Called by the Python voice agent when a call begins.
 * Logs the call and returns member data if found.
 */
export const callStartedHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { livekitRoomId, sipCallId, direction, sandbox } = body;
  let rawPhone = body.phone;

  // Normalize phone: strip sip_ prefix, ensure +1 for US numbers
  if (rawPhone) {
    rawPhone = String(rawPhone).replace(/^sip_/, "");
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10) rawPhone = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith("1")) rawPhone = `+${digits}`;
    else if (!rawPhone.startsWith("+")) rawPhone = `+${digits}`;
  }

  // If phone is still null, try to extract from room name (e.g. "call-_+17542026432_xxx")
  if (!rawPhone && livekitRoomId) {
    const phoneMatch = livekitRoomId.match(/\+\d{10,15}/);
    if (phoneMatch) rawPhone = phoneMatch[0];
  }

  const phone: string | undefined = rawPhone || undefined;
  console.log("[callStarted] Room=%s phone=%s sandbox=%s direction=%s", livekitRoomId, phone, sandbox, direction);

  // Look up member by phone
  let member = null;
  let memberId = undefined;
  if (phone) {
    member = await ctx.runQuery(internal.voice.queries.lookupMemberByPhone, {
      phone,
    });
    if (member) {
      memberId = member._id;
      console.log("[callStarted] Member found: %s (id=%s)", member.firstName, memberId);
    } else {
      console.log("[callStarted] No member found for phone: %s", phone);
    }
  }

  // Log the call
  const callId = await ctx.runMutation(internal.voice.mutations.logCall, {
    livekitRoomId,
    sipCallId: sipCallId ?? undefined,
    memberId,
    phone: phone ?? undefined,
    direction: direction ?? "inbound",
    sandbox: sandbox ?? undefined,
  });
  console.log("[callStarted] Call logged: callId=%s", callId);

  // Fetch rich member context (full profile + previous intake data)
  let memberContext = null;
  if (memberId) {
    memberContext = await ctx.runQuery(
      internal.voice.queries.getMemberFullContext,
      { memberId }
    );
    console.log("[callStarted] Member context loaded: smaId=%s profileFields=%d",
      memberContext?.smaId, Object.keys(memberContext?.smaProfile || {}).length);
  }

  return new Response(
    JSON.stringify({
      callId,
      member: memberContext,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

/**
 * POST /voice/call-ended
 * Called when a call ends. Saves transcript and triggers AI summary.
 */
export const callEndedHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { callId, duration, transcript, status, egressId } = body;
  console.log("[callEnded] callId=%s duration=%ds segments=%d status=%s",
    callId, duration, Array.isArray(transcript) ? transcript.length : 0, status);

  await ctx.runMutation(internal.voice.mutations.updateCall, {
    callId,
    status: status ?? "completed",
    duration,
    transcript,
    egressId: egressId ?? undefined,
  });

  // Trigger AI summary generation (syncCallToSMA is scheduled at the end of generateSummary)
  console.log("[callEnded] Scheduling generateSummary");
  await ctx.scheduler.runAfter(0, internal.voice.actions.generateSummary, {
    callId,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * POST /voice/transcript-segment
 * Stream transcript segments in real-time during a call.
 */
export const transcriptSegmentHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { callId, speaker, text, timestamp, confidence } = body;

  await ctx.runMutation(internal.voice.mutations.addTranscriptSegment, {
    callId,
    speaker,
    text,
    timestamp,
    confidence: confidence ?? undefined,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * POST /voice/save-intake-data
 * Save structured data extracted during the call.
 */
export const saveIntakeDataHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { callId, data } = body;
  console.log("[saveIntakeData] callId=%s fields: %s", callId, Object.keys(data || {}).join(", "));

  await ctx.runMutation(internal.voice.mutations.saveIntakeData, {
    callId,
    data,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * POST /voice/send-data-request
 * Create and send a profile completion form link to a member via WhatsApp.
 * Called by the voice agent mid-call.
 */
export const sendDataRequestHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { memberId } = body;
  console.log("[sendDataRequest] memberId=%s", memberId);

  const result = await ctx.runMutation(
    internal.dataRequests.mutations.createAndSendFromAgent,
    { memberId }
  );

  console.log("[sendDataRequest] result: requestId=%s alreadyPending=%s",
    result.requestId, result.alreadyPending);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * POST /voice/lookup-phone
 * Look up a phone number in the local DB and (optionally) SMA CRM.
 * Called by the voice agent at the start of a call to determine
 * whether the caller is an existing profile or a new person.
 *
 * Returns: { found: true, member: {...} } or { found: false }
 */
export const lookupPhoneHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  let rawPhone = body.phone;

  // Normalize phone
  if (rawPhone) {
    rawPhone = String(rawPhone).replace(/^sip_/, "");
    const digits = rawPhone.replace(/\D/g, "");
    if (digits.length === 10) rawPhone = `+1${digits}`;
    else if (digits.length === 11 && digits.startsWith("1")) rawPhone = `+${digits}`;
    else if (!rawPhone.startsWith("+")) rawPhone = `+${digits}`;
  }

  const phone: string | undefined = rawPhone || undefined;
  console.log("[lookupPhone] phone=%s", phone);

  if (!phone) {
    return new Response(
      JSON.stringify({ found: false, reason: "no_phone" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 1. Check local Convex members table
  const member = await ctx.runQuery(internal.voice.queries.lookupMemberByPhone, {
    phone,
  });

  if (member) {
    console.log("[lookupPhone] Found in local DB: %s (id=%s smaId=%s)",
      member.firstName, member._id, member.smaId);

    // Return rich context for the agent
    const memberContext = await ctx.runQuery(
      internal.voice.queries.getMemberFullContext,
      { memberId: member._id }
    );

    return new Response(
      JSON.stringify({
        found: true,
        source: "local",
        member: memberContext,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // 2. Fallback: search SMA CRM by phone
  console.log("[lookupPhone] Not in local DB — searching SMA CRM");
  try {
    const smaResult = await ctx.runAction(
      internal.voice.actions.lookupPhoneInSma,
      { phone }
    );

    if (smaResult && smaResult.found) {
      console.log("[lookupPhone] Found in SMA: %s (smaId=%s memberId=%s)",
        smaResult.firstName, smaResult.smaId, smaResult.memberId);
      return new Response(
        JSON.stringify(smaResult),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.warn("[lookupPhone] SMA lookup failed (non-fatal):", err.message);
  }

  console.log("[lookupPhone] Phone not found anywhere");
  return new Response(
    JSON.stringify({ found: false }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

/**
 * POST /voice/fetch-sma-profile
 * Fetch a member's SMA profile and preferences, store in profileData.
 */
export const fetchSmaProfileHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { memberId } = body;

  const result = await ctx.runAction(internal.voice.actions.fetchSmaProfile, {
    memberId,
  });

  return new Response(JSON.stringify(result ?? {}), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});

/**
 * POST /voice/log-usage
 * Called by the Python voice agent at end of call to log STT/LLM/TTS usage
 * for token analytics tracking.
 */
export const logVoiceUsageHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const {
    callId,
    durationSecs,
    sttModel,
    llmModel,
    ttsModel,
    userTokens,
    agentTokens,
    transcriptSegments,
  } = body;

  const now = Date.now();

  // Pricing estimates (per million tokens / per minute for audio services)
  // These approximate rates for Deepgram Nova-3, OpenRouter LLM, ElevenLabs TTS
  const DEEPGRAM_COST_PER_MIN = 0.0043;   // ~$0.0043/min for Nova-3
  const ELEVENLABS_COST_PER_CHAR = 0.00003; // ~$0.30 per 10K chars

  // Log STT usage (Deepgram — billed by audio duration)
  const sttCost = (durationSecs / 60) * DEEPGRAM_COST_PER_MIN;
  await ctx.runMutation(internal.analytics.tokenTracking.logTokenUsage, {
    processType: "voice-intake",
    provider: "other",
    model: sttModel || "deepgram/nova-3",
    inputTokens: userTokens || 0,
    outputTokens: 0,
    totalTokens: userTokens || 0,
    costUsd: Math.round(sttCost * 1_000_000) / 1_000_000,
    latencyMs: durationSecs * 1000,
    entityType: "call",
    entityId: callId,
    metadata: { service: "stt", durationSecs, transcriptSegments },
  });

  // Log LLM usage (OpenRouter — billed by tokens)
  // Look up pricing from the modelPricing table
  const pricing = await ctx.runQuery(
    internal.analytics.pricingSync.getPricingForModel,
    { model: llmModel?.replace("openrouter/", "") || "unknown" }
  );
  const totalLlmTokens = (userTokens || 0) + (agentTokens || 0);
  const llmCost = pricing
    ? calculateCostUsd(userTokens || 0, agentTokens || 0, pricing.inputPricePerMillion, pricing.outputPricePerMillion)
    : totalLlmTokens * 0.000003; // fallback ~$3/1M tokens

  await ctx.runMutation(internal.analytics.tokenTracking.logTokenUsage, {
    processType: "voice-intake",
    provider: "openrouter",
    model: llmModel || "unknown",
    inputTokens: userTokens || 0,
    outputTokens: agentTokens || 0,
    totalTokens: totalLlmTokens,
    costUsd: Math.round(llmCost * 1_000_000) / 1_000_000,
    latencyMs: durationSecs * 1000,
    entityType: "call",
    entityId: callId,
    metadata: { service: "llm", durationSecs },
  });

  // Log TTS usage (ElevenLabs — billed by characters)
  // Rough estimate: agent_tokens * 4 chars per token
  const ttsChars = (agentTokens || 0) * 4;
  const ttsCost = ttsChars * ELEVENLABS_COST_PER_CHAR;
  await ctx.runMutation(internal.analytics.tokenTracking.logTokenUsage, {
    processType: "voice-intake",
    provider: "other",
    model: ttsModel || "elevenlabs/unknown",
    inputTokens: agentTokens || 0,
    outputTokens: 0,
    totalTokens: agentTokens || 0,
    costUsd: Math.round(ttsCost * 1_000_000) / 1_000_000,
    latencyMs: durationSecs * 1000,
    entityType: "call",
    entityId: callId,
    metadata: { service: "tts", durationSecs, estimatedChars: ttsChars },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
