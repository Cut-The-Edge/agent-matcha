// @ts-nocheck
"use node";
/**
 * Pitch Arena Actions
 *
 * LLM-powered pitch generation and post-call CRM sync.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "../integrations/openrouter/config";

const DEFAULT_PITCH_PROMPT = `You are an expert matchmaker preparing a real-time sales pitch for a potential match.

You have two data sources:
1. Everything known about the MEMBER (the person who hired the matchmaker)
2. A live phone call transcript between the matchmaker (Dani) and the MATCH (the person being pitched to)

Your job: Generate a compelling, natural sales pitch that Dani can use RIGHT NOW on the call.

Rules:
- Write in Dani's voice — warm, confident, conversational
- Reference specific details from BOTH the member profile AND the live transcript
- Highlight genuine compatibility points between the member and match
- Address any concerns or hesitations the match has expressed in the call
- Keep it concise — 3-5 short paragraphs max
- Include 2-3 specific talking points Dani can use immediately
- End with a suggested next step or ask`;

/**
 * Generate a sales pitch from member data + live call transcript.
 * Called when Dani clicks "Create Sales Pitch" during an active call.
 */
export const generatePitch = internalAction({
  args: {
    sessionId: v.id("pitchArenaSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(
      internal.pitchArena.queries.internalGetSession,
      { sessionId: args.sessionId }
    );
    if (!session) return { generated: false, reason: "session_not_found" };

    // Load member profile (the paying member)
    const member = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: session.memberId }
    );

    // Load match member profile (the person being called)
    const matchMember = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: session.matchMemberId }
    );

    if (!member || !matchMember) {
      return { generated: false, reason: "missing_member_data" };
    }

    // Load live transcript segments
    let segments: any[] = [];
    if (session.callId) {
      segments = await ctx.runQuery(
        internal.pitchArena.queries.internalGetTranscript,
        { callId: session.callId }
      );
    }

    // Build transcript text
    const transcriptText = segments.length > 0
      ? segments
          .map((s: any) => `${s.speaker === "caller" ? "Match" : "Dani"}: ${s.text}`)
          .join("\n")
      : "(No transcript yet — call just started)";

    // Load custom pitch prompt from settings
    const pitchSettings = await ctx.runQuery(
      internal.settings.getMembershipPitchSettings,
      {}
    );
    const pitchPrompt = pitchSettings.prompt || DEFAULT_PITCH_PROMPT;

    // Build the LLM input
    const memberProfile = [
      `Name: ${member.firstName} ${member.lastName || ""}`.trim(),
      member.tier ? `Tier: ${member.tier}` : null,
      member.matchmakerNotes ? `Matchmaker Notes: ${member.matchmakerNotes}` : null,
      member.profileData ? `Profile Data: ${JSON.stringify(member.profileData)}` : null,
    ].filter(Boolean).join("\n");

    const matchProfile = [
      `Name: ${matchMember.firstName} ${matchMember.lastName || ""}`.trim(),
      matchMember.phone ? `Phone: ${matchMember.phone}` : null,
      matchMember.profileData ? `Profile Data: ${JSON.stringify(matchMember.profileData)}` : null,
    ].filter(Boolean).join("\n");

    const userMessage = `=== MEMBER (who hired us) ===
${memberProfile}

=== MATCH (person on the call) ===
${matchProfile}

=== LIVE CALL TRANSCRIPT ===
${transcriptText}

Generate a sales pitch Dani can use right now.`;

    try {
      const apiKey = getOpenRouterApiKey();
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: pitchPrompt },
            { role: "user", content: userMessage },
          ],
          temperature: 0.7,
          max_tokens: 800,
        }),
      });

      if (!response.ok) {
        console.error(`Pitch generation LLM error: ${response.status}`);
        return { generated: false, reason: "llm_error" };
      }

      const data = await response.json();
      const pitch = (data?.choices?.[0]?.message?.content || "").trim();

      if (!pitch) {
        return { generated: false, reason: "empty_response" };
      }

      // Save the pitch
      await ctx.runMutation(
        internal.pitchArena.mutations.savePitch,
        {
          sessionId: args.sessionId,
          pitch,
          transcriptSnapshotLength: segments.length,
        }
      );

      console.log(
        `Pitch generated for session ${args.sessionId} ` +
        `(${segments.length} transcript segments, ${pitch.length} chars)`
      );

      return { generated: true, pitchLength: pitch.length };
    } catch (error: any) {
      console.error("Pitch generation failed:", error?.message);
      return { generated: false, reason: "error", error: error?.message };
    }
  },
});

/**
 * After a Pitch Arena call ends:
 * 1. Generate an AI summary of the call
 * 2. Save summary to the phone call record
 * 3. Upload transcript + summary + pitches to SMA CRM for both members
 */
export const syncSessionToCrm = internalAction({
  args: {
    sessionId: v.id("pitchArenaSessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(
      internal.pitchArena.queries.internalGetSession,
      { sessionId: args.sessionId }
    );
    if (!session || !session.callId) return;

    // Load transcript
    const segments = await ctx.runQuery(
      internal.pitchArena.queries.internalGetTranscript,
      { callId: session.callId }
    );

    const transcriptText = segments
      .map((s: any) => `${s.speaker === "caller" ? "Match" : "Dani"}: ${s.text}`)
      .join("\n");

    const pitchesText = (session.generatedPitches || [])
      .map((p: any, i: number) =>
        `--- Pitch ${i + 1} ---\n${p.pitch}`
      )
      .join("\n\n");

    // ── Generate AI call summary ──────────────────────────────────────
    let aiSummary = "";
    if (transcriptText && segments.length >= 3) {
      try {
        const apiKey = getOpenRouterApiKey();
        const summaryRes = await fetch(OPENROUTER_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: [
              {
                role: "system",
                content: "Summarize this matchmaker-to-match phone call in 3-5 sentences. Focus on: key topics discussed, match's interest level, any concerns raised, and suggested next steps.",
              },
              { role: "user", content: transcriptText },
            ],
            temperature: 0.3,
            max_tokens: 300,
          }),
        });

        if (summaryRes.ok) {
          const data = await summaryRes.json();
          aiSummary = (data?.choices?.[0]?.message?.content || "").trim();
        }
      } catch (err: any) {
        console.warn("Pitch Arena summary generation failed:", err?.message);
      }
    }

    // Save AI summary to the phone call record
    if (aiSummary) {
      await ctx.runMutation(internal.voice.mutations.updateCall, {
        callId: session.callId,
        status: "completed",
        aiSummary: { summary: aiSummary },
      });
    }

    // ── Build CRM file content ────────────────────────────────────────
    const date = new Date(session.createdAt).toISOString().split("T")[0];
    const fileContent = [
      `=== Pitch Arena Call (${date}) ===`,
      ``,
      aiSummary ? `=== AI Summary ===\n${aiSummary}\n` : "",
      `=== Call Transcript ===`,
      transcriptText || "(No transcript recorded)",
      ``,
      pitchesText ? `=== Generated Pitches ===\n${pitchesText}` : "",
      ``,
      `---\nAuto-generated by Club Allenby Bot`,
    ].filter(Boolean).join("\n");

    // ── Upload to SMA CRM for both members ────────────────────────────
    const { uploadClientFile } = await import(
      "../integrations/smartmatchapp/client"
    );

    const member = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: session.memberId }
    );
    const matchMember = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: session.matchMemberId }
    );

    const fileName = `pitch-arena-${date}.txt`;

    for (const m of [member, matchMember]) {
      if (m?.smaId) {
        const numericId = Number(m.smaId);
        if (!isNaN(numericId)) {
          try {
            await uploadClientFile(numericId, fileName, fileContent);
            console.log(`[pitch-arena] Uploaded ${fileName} to SMA client ${m.smaId}`);
          } catch (err: any) {
            console.warn(`[pitch-arena] CRM upload failed for ${m.smaId}:`, err?.message);
          }
        }
      }
    }

    console.log(`Pitch Arena CRM sync completed for session ${args.sessionId}`);
  },
});
