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
