// @ts-nocheck
"use node";
/**
 * Action Queue Actions
 *
 * AI-powered actions for the action queue:
 * - generateIntelligenceBrief: Creates a Match Intelligence Brief
 *   that summarizes talking points for Dani's outreach call to the
 *   match partner. Uses OpenRouter via AI SDK.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { logAiSdkUsage } from "../analytics/instrumentLlm";

const MODEL = "gpt-4o";

// ============================================================================
// generateIntelligenceBrief — AI-assisted outreach brief for Dani
// ============================================================================

export const generateIntelligenceBrief = internalAction({
  args: {
    actionItemId: v.id("actionQueue"),
  },
  handler: async (ctx, args) => {
    const startMs = Date.now();

    // Read the action item
    const item = await ctx.runQuery(
      internal.actionQueue.queries.getByIdInternal,
      { actionItemId: args.actionItemId }
    );
    if (!item) {
      console.error(`[action-queue-ai] Item ${args.actionItemId} not found`);
      return null;
    }

    // Read both members via the match
    if (!item.matchId) {
      console.error(`[action-queue-ai] Item ${args.actionItemId} has no matchId`);
      return null;
    }

    const member = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: item.memberId }
    );

    const matchRecord = await ctx.runQuery(
      internal.matches.queries.getInternal,
      { matchId: item.matchId }
    );

    if (!matchRecord) {
      console.error(`[action-queue-ai] Match ${item.matchId} not found`);
      return null;
    }

    const partnerId =
      matchRecord.memberAId === item.memberId
        ? matchRecord.memberBId
        : matchRecord.memberAId;

    const partner = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: partnerId }
    );

    const memberName = member
      ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
      : "Unknown";
    const partnerName = partner
      ? `${partner.firstName}${partner.lastName ? ` ${partner.lastName}` : ""}`
      : "Unknown";

    // Build the prompt
    const prompt = `You are a matchmaking assistant for Club Allenby, a Jewish singles matchmaking club.

A member named ${memberName} has paid $125 for curated outreach — they are interested in being introduced to ${partnerName}. Dani (the matchmaker) now needs to personally contact ${partnerName} to gauge their interest.

Generate a brief "Match Intelligence Brief" — a short document (3-5 bullet points) that Dani can use when calling ${partnerName}. The brief should:

1. Summarize who ${memberName} is (key highlights from their profile)
2. Note what might appeal to ${partnerName} about this match
3. Suggest talking points for the outreach call
4. Include any relevant context about the member's interest level

${member?.profileData ? `Member profile data:\n${JSON.stringify(member.profileData, null, 2)}` : "No detailed profile data available."}

${partner?.profileData ? `Match partner profile data:\n${JSON.stringify(partner.profileData, null, 2)}` : "No detailed partner profile data available."}

${member?.matchmakerNotes ? `Matchmaker notes about ${memberName}:\n${member.matchmakerNotes}` : ""}
${partner?.matchmakerNotes ? `Matchmaker notes about ${partnerName}:\n${partner.matchmakerNotes}` : ""}

Keep it concise and actionable — this is for Dani's quick reference before making a phone call.`;

    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    try {
      const result = await generateText({
        model: openrouter(MODEL),
        prompt,
        temperature: 0.6,
        maxTokens: 500,
      });

      const brief = result.text;

      // Store the brief
      await ctx.runMutation(
        internal.actionQueue.mutations.updateIntelligenceBriefInternal,
        {
          actionItemId: args.actionItemId,
          matchIntelligenceBrief: brief,
        }
      );

      // Log token usage
      await logAiSdkUsage(ctx, result, {
        processType: "other",
        provider: "openrouter",
        model: MODEL,
        latencyMs: Date.now() - startMs,
        entityType: "actionQueue",
        entityId: String(args.actionItemId),
      });

      console.log(
        `[action-queue-ai] Generated intelligence brief for ${args.actionItemId}`
      );

      return brief;
    } catch (error: any) {
      console.error(
        `[action-queue-ai] Failed to generate brief:`,
        error?.message || error
      );
      return null;
    }
  },
});

// ============================================================================
// generateDeclineInsight — Soft AI reframe of why the match declined
// ============================================================================

/**
 * When Dani records "match_not_interested" with notes about why,
 * this generates a soft, member-friendly reframe of the reason.
 *
 * Returns null if the reason is hurtful or shouldn't be shared
 * (e.g. "not attracted", "too old"). In that case, only the base
 * message is sent without any insight.
 */
export const generateDeclineInsight = internalAction({
  args: {
    outreachNotes: v.string(),
    matchFirstName: v.string(),
  },
  handler: async (ctx, args) => {
    const startMs = Date.now();

    const openrouter = createOpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });

    const prompt = `You are a matchmaking assistant for Club Allenby, a Jewish singles matchmaking club.

The matchmaker (Dani) reached out to a match partner named ${args.matchFirstName} on behalf of a paying member. The match partner decided NOT to move forward. Dani recorded these notes about why:

"${args.outreachNotes}"

Your task:
1. Determine if the reason is SHAREABLE with the paying member (the person who paid for the outreach).
2. If shareable, reframe it into a soft, respectful, one-sentence insight.
3. If NOT shareable (because it's about physical attraction, age, appearance, or anything that would be hurtful), return exactly: NULL

SHAREABLE examples (neutral/positive reasons):
- "They're currently dating someone" → "From the conversation, it seems they're currently exploring another connection."
- "They want to meet someone local" → "They mentioned they're prioritizing meeting someone closer to their area right now."
- "They're taking a break from dating" → "It sounds like they're taking a pause from dating at the moment."
- "Not looking for something serious right now" → "They shared that they're not looking for anything serious right now."

NOT SHAREABLE (return NULL):
- "Not attracted" → NULL
- "Too old for them" → NULL
- "Didn't like the photos" → NULL
- "Not their type physically" → NULL
- "Found them boring" → NULL

Respond with ONLY the reframed insight sentence, or the word NULL. Nothing else.`;

    try {
      const result = await generateText({
        model: openrouter(MODEL),
        prompt,
        temperature: 0.3,
        maxTokens: 150,
      });

      const insight = result.text.trim();

      // Log token usage
      await logAiSdkUsage(ctx, result, {
        processType: "other",
        provider: "openrouter",
        model: MODEL,
        latencyMs: Date.now() - startMs,
        entityType: "actionQueue",
        entityId: "decline_insight",
      });

      // Check if AI decided the reason is not shareable
      if (insight === "NULL" || insight.toUpperCase() === "NULL") {
        console.log(
          `[action-queue-ai] Decline reason not shareable — skipping insight`
        );
        return null;
      }

      console.log(
        `[action-queue-ai] Generated decline insight: "${insight}"`
      );
      return insight;
    } catch (error: any) {
      console.error(
        `[action-queue-ai] Failed to generate decline insight:`,
        error?.message || error
      );
      return null;
    }
  },
});

// ============================================================================
// generateDeclineInsightAndStartFlow — AI insight → start continuation flow
// ============================================================================

/**
 * Generates an optional AI decline insight, then starts the outreach
 * continuation flow with the insight embedded in context.
 * Called when Dani records "match_not_interested" with notes.
 */
export const generateDeclineInsightAndStartFlow = internalAction({
  args: {
    flowDefinitionId: v.id("flowDefinitions"),
    matchId: v.id("matches"),
    memberId: v.id("members"),
    outreachOutcome: v.string(),
    outreachNotes: v.string(),
    memberFirstName: v.string(),
    matchFirstName: v.string(),
    matchPhone: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate the AI decline insight (may return null if not shareable)
    let declineInsight = "";
    try {
      const insight = await ctx.runAction(
        internal.actionQueue.actions.generateDeclineInsight,
        {
          outreachNotes: args.outreachNotes,
          matchFirstName: args.matchFirstName,
        }
      );
      if (insight) {
        declineInsight = insight;
      }
    } catch (error: any) {
      console.error(
        `[action-queue-ai] Decline insight failed, proceeding without:`,
        error?.message || error
      );
    }

    // Start the continuation flow with the insight in metadata
    await ctx.runMutation(
      internal.actionQueue.mutations.startOutreachContinuationFlow,
      {
        flowDefinitionId: args.flowDefinitionId,
        matchId: args.matchId,
        memberId: args.memberId,
        outreachOutcome: args.outreachOutcome,
        memberFirstName: args.memberFirstName,
        matchFirstName: args.matchFirstName,
        matchPhone: args.matchPhone,
        declineInsight,
        outreachNotes: args.outreachNotes,
      }
    );
  },
});
