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
  const { livekitRoomId, sipCallId, phone, direction } = body;

  // Look up member by phone
  let member = null;
  let memberId = undefined;
  if (phone) {
    member = await ctx.runQuery(internal.voice.queries.lookupMemberByPhone, {
      phone,
    });
    if (member) {
      memberId = member._id;
    }
  }

  // Log the call
  const callId = await ctx.runMutation(internal.voice.mutations.logCall, {
    livekitRoomId,
    sipCallId,
    memberId,
    phone,
    direction: direction ?? "inbound",
  });

  return new Response(
    JSON.stringify({
      callId,
      member: member
        ? {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            tier: member.tier,
            status: member.status,
            profileComplete: member.profileComplete,
          }
        : null,
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
  const { callId, duration, transcript, status } = body;

  await ctx.runMutation(internal.voice.mutations.updateCall, {
    callId,
    status: status ?? "completed",
    duration,
    transcript,
  });

  // Trigger AI summary generation
  await ctx.scheduler.runAfter(0, internal.voice.actions.generateSummary, {
    callId,
  });

  // Trigger SMA sync
  await ctx.scheduler.runAfter(0, internal.voice.actions.syncCallToSMA, {
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
    confidence,
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
 * POST /voice/lookup-member
 * Look up a member by phone number.
 */
export const lookupMemberHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { phone } = body;

  const member = await ctx.runQuery(
    internal.voice.queries.lookupMemberByPhone,
    { phone }
  );

  return new Response(
    JSON.stringify({
      member: member
        ? {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            tier: member.tier,
            status: member.status,
            profileComplete: member.profileComplete,
          }
        : null,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

/**
 * POST /voice/escalate
 * Record an escalation and trigger notification.
 */
export const escalateHandler = httpAction(async (ctx, request) => {
  const body = await request.json();
  const { callId, reason } = body;

  await ctx.runMutation(internal.voice.mutations.recordEscalation, {
    callId,
    reason,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
