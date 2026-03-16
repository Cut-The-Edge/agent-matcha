// @ts-nocheck
/**
 * SmartMatchApp Webhook Handler
 *
 * Receives events from SMA: match_added, client_created, client_updated,
 * client_profile_updated, match_updated, and the verification challenge.
 *
 * POST /sma/webhook
 */

import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Verify the HMAC SHA-256 signature from SMA.
 * Message = "{timestamp}.{payload}"
 */
async function verifySignature(
  payload: string,
  signature: string,
  timestamp: string
): Promise<boolean> {
  const secret = process.env.SMA_WEBHOOK_SECRET;
  if (!secret) {
    console.warn("SMA_WEBHOOK_SECRET not set — skipping signature verification");
    return true;
  }

  const message = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === signature;
}

export const smaWebhookHandler = httpAction(async (ctx, request) => {
  const rawBody = await request.text();

  // ── Signature verification ──────────────────────────────────────
  const signature = request.headers.get("X-Signature") ?? "";
  const timestamp = request.headers.get("X-Timestamp") ?? "";

  if (signature && timestamp) {
    const valid = await verifySignature(rawBody, signature, timestamp);
    if (!valid) {
      console.error("SMA webhook signature verification failed");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ── Parse event ─────────────────────────────────────────────────
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const event = body.event;
  const payload = body.payload;

  console.log(`SMA webhook received: event=${event}`, JSON.stringify(payload));

  // ── Verification challenge ──────────────────────────────────────
  if (event === "verification") {
    console.log("SMA webhook verification challenge received");
    return new Response(
      JSON.stringify({ challenge: body.challenge }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Match Added ─────────────────────────────────────────────────
  if (event === "match_added") {
    const clientId = payload?.client?.id;
    const matchId = payload?.match?.id;
    const smaMatchId = payload?.id;

    if (!clientId || !matchId) {
      return new Response(
        JSON.stringify({ error: "Missing client.id or match.id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Schedule the action (returns 200 immediately — SMA requires fast response)
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.smartmatchapp.actions.handleMatchAdded,
      {
        smaMatchId: smaMatchId ?? 0,
        clientId,
        matchId,
        groupName: payload?.group?.name,
        groupId: payload?.group?.id,
      }
    );

    // Re-sync intro counts for both sides (delay 10s so handleMatchAdded
    // creates the match first — avoids duplicate match creation in syncIntrosInternal)
    await ctx.scheduler.runAfter(10000, internal.integrations.smartmatchapp.actions.syncMemberIntros, { smaClientId: clientId });
    await ctx.scheduler.runAfter(10000, internal.integrations.smartmatchapp.actions.syncMemberIntros, { smaClientId: matchId });

    return new Response(
      JSON.stringify({ ok: true, event: "match_added", scheduled: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Client events (sync member data) ────────────────────────────
  if (
    event === "client_created" ||
    event === "client_updated" ||
    event === "client_profile_updated" ||
    event === "client_preferences_updated"
  ) {
    const clientId = payload?.id;
    if (!clientId) {
      return new Response(
        JSON.stringify({ error: "Missing client id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Schedule async sync — pass the webhook payload directly (no need to call SMA API back)
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.smartmatchapp.actions.handleClientSync,
      { smaClientId: clientId, event, webhookPayload: payload }
    );

    return new Response(
      JSON.stringify({ ok: true, event, scheduled: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Match Updated (status change within a group) ────────────────
  if (event === "match_updated") {
    const smaIntroId = payload?.id;
    if (smaIntroId) {
      // Update internal matches table
      await ctx.scheduler.runAfter(
        0,
        internal.matches.mutations.updateMatchFromSma,
        {
          smaIntroId: String(smaIntroId),
          smaStatusId: payload?.status?.id,
          smaStatusName: payload?.status?.name,
        }
      );
      // Immediately update smaIntroductions record with new status
      await ctx.scheduler.runAfter(
        0,
        internal.members.mutations.updateIntroFromSma,
        {
          smaMatchId: smaIntroId,
          matchStatus: payload?.status?.name,
          matchStatusId: payload?.status?.id,
        }
      );
      // Local records updated above — skip full API re-sync to save API quota
    }
    return new Response(
      JSON.stringify({ ok: true, event: "match_updated", scheduled: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Match Group Changed (moved between groups) ─────────────────
  if (event === "match_group_changed") {
    const smaIntroId = payload?.id;
    if (smaIntroId) {
      // Update internal matches table
      await ctx.scheduler.runAfter(
        0,
        internal.matches.mutations.updateMatchFromSma,
        {
          smaIntroId: String(smaIntroId),
          smaGroupId: payload?.group?.id,
          smaGroupName: payload?.group?.name,
        }
      );
      // Immediately update smaIntroductions record with new group
      await ctx.scheduler.runAfter(
        0,
        internal.members.mutations.updateIntroFromSma,
        {
          smaMatchId: smaIntroId,
          group: payload?.group?.name,
          groupId: payload?.group?.id,
        }
      );
      // Local records updated above — skip full API re-sync to save API quota

      // Trigger flow when moved to "Automated Intro".
      // 10s delay avoids a race with match_added (which also starts the flow).
      // SMA fires both events nearly simultaneously for new matches;
      // the delay lets match_added set flowTriggered=true first.
      if (payload?.group?.name === "Automated Intro") {
        await ctx.scheduler.runAfter(
          10000,
          internal.integrations.smartmatchapp.actions.triggerFlowForActiveIntro,
          { smaIntroId: String(smaIntroId) }
        );
      }
    }
    return new Response(
      JSON.stringify({ ok: true, event: "match_group_changed", scheduled: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Match Deleted ───────────────────────────────────────────────
  if (event === "match_deleted") {
    const smaMatchId = payload?.id;
    if (smaMatchId) {
      // Mark internal match as expired so dashboard reflects deletion
      await ctx.scheduler.runAfter(0, internal.matches.mutations.deleteMatchFromSma, {
        smaIntroId: String(smaMatchId),
      });
      // Re-sync intros for affected members — the deleted match
      // won't appear in the fresh API response, so it gets removed naturally
      await ctx.scheduler.runAfter(0, internal.integrations.smartmatchapp.actions.syncIntrosForMatch, { smaMatchId });
    }
    return new Response(
      JSON.stringify({ ok: true, event: "match_deleted", scheduled: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  // ── Unknown event ───────────────────────────────────────────────
  console.log(`SMA webhook: unhandled event type "${event}"`);
  return new Response(
    JSON.stringify({ ok: true, event, unhandled: true }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
