// @ts-nocheck
import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * POST /voice/call-started
 * Called by the Python voice agent when a call begins.
 * Logs the call and returns member data if found.
 */
export const callStartedHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { livekitRoomId, sipCallId, phone, direction, sandbox } = body;
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
    phone,
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
