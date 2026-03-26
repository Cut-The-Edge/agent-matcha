// @ts-nocheck
"use node";
/**
 * Date Feedback Actions
 *
 * LLM-powered Compatibility Signal Score generation.
 * Called when both members have submitted post-date feedback.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "../integrations/openrouter/config";

/**
 * Generate a Compatibility Signal Score from both members' date feedback.
 *
 * Reads both dateFeedback records, uses LLM to score 5 dimensions,
 * saves to compatibilityScores, updates match, and syncs notes to SMA.
 */
export const generateCompatibilityScore = internalAction({
  args: {
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    // Load both feedback records
    const allFeedback = await ctx.runQuery(
      internal.dateFeedback.queries.getByMatch,
      { matchId: args.matchId }
    );

    if (allFeedback.length < 2) {
      console.log(`generateCSS: only ${allFeedback.length} feedback records for match ${args.matchId}, skipping`);
      return { generated: false, reason: "insufficient_feedback" };
    }

    // Dedup guard: skip if CSS was already generated (race condition between two flow instances)
    const alreadyGenerated = allFeedback.every((f: any) => f.cssGenerated);
    if (alreadyGenerated) {
      console.log(`generateCSS: CSS already generated for match ${args.matchId}, skipping duplicate`);
      return { generated: false, reason: "already_generated" };
    }

    const match = await ctx.runQuery(
      internal.matches.queries.getInternal,
      { matchId: args.matchId }
    );
    if (!match) return { generated: false, reason: "match_not_found" };

    const memberA = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: match.memberAId }
    );
    const memberB = await ctx.runQuery(
      internal.members.queries.getByIdInternal,
      { memberId: match.memberBId }
    );

    const feedbackA = allFeedback.find((f: any) => String(f.memberId) === String(match.memberAId));
    const feedbackB = allFeedback.find((f: any) => String(f.memberId) === String(match.memberBId));

    if (!feedbackA || !feedbackB || !memberA || !memberB) {
      return { generated: false, reason: "missing_data" };
    }

    // Build LLM prompt for CSS generation
    const prompt = `You are an expert matchmaker analyzing post-date feedback from two people who were introduced.

=== ${memberA.firstName}'s Feedback ===
Overall: ${feedbackA.overallRating}
Would see again: ${feedbackA.wouldSeeAgain ?? "not specified"}
Positive signals: ${(feedbackA.positiveSignals || []).join(", ") || "none"}
Negative categories: ${(feedbackA.negativeCategories || []).join(", ") || "none"}
Negative details: ${JSON.stringify(feedbackA.negativeSubCategories || {})}
Free text: "${feedbackA.freeText || "none"}"

=== ${memberB.firstName}'s Feedback ===
Overall: ${feedbackB.overallRating}
Would see again: ${feedbackB.wouldSeeAgain ?? "not specified"}
Positive signals: ${(feedbackB.positiveSignals || []).join(", ") || "none"}
Negative categories: ${(feedbackB.negativeCategories || []).join(", ") || "none"}
Negative details: ${JSON.stringify(feedbackB.negativeSubCategories || {})}
Free text: "${feedbackB.freeText || "none"}"

=== Your Task ===
Generate a Compatibility Signal Score. Score each dimension 0-10 based on BOTH sides' feedback.

Rules:
- If both say "great_chemistry" → base scores 8-9
- If both say "not_a_match" → base scores 2-4
- Mixed signals → scores 4-7 depending on specifics
- Mutual positive signals boost scores
- One-sided negative signals reduce relevant dimensions moderately
- Both-sided negative signals reduce dimensions significantly

Return ONLY valid JSON:
{
  "overallScore": <0-10>,
  "lifestyle": <0-10>,
  "energy": <0-10>,
  "values": <0-10>,
  "attraction": <0-10>,
  "chemistry": <0-10>,
  "summary": "<2-3 sentence summary of the match dynamic>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>", "<weakness 2>"],
  "patternInsightA": "<what this date reveals about ${memberA.firstName}'s preferences>",
  "patternInsightB": "<what this date reveals about ${memberB.firstName}'s preferences>"
}`;

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
            { role: "user", content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        console.error(`CSS generation LLM error: ${response.status}`);
        return { generated: false, reason: "llm_error" };
      }

      const data = await response.json();
      const text = (data?.choices?.[0]?.message?.content || "").trim();
      const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
      const scores = JSON.parse(cleaned);

      // Save compatibility score
      await ctx.runMutation(
        internal.dateFeedback.mutations.saveCompatibilityScore,
        {
          matchId: args.matchId,
          memberAId: match.memberAId,
          memberBId: match.memberBId,
          overallScore: scores.overallScore,
          lifestyle: scores.lifestyle,
          energy: scores.energy,
          values: scores.values,
          attraction: scores.attraction,
          chemistry: scores.chemistry,
          feedbackAId: feedbackA._id,
          feedbackBId: feedbackB._id,
          summary: scores.summary,
          strengths: scores.strengths,
          weaknesses: scores.weaknesses,
        }
      );

      // Update match with CSS
      await ctx.runMutation(
        internal.dateFeedback.mutations.updateMatchCss,
        {
          matchId: args.matchId,
          cssScore: scores.overallScore,
          cssDimensions: {
            lifestyle: scores.lifestyle,
            energy: scores.energy,
            values: scores.values,
            attraction: scores.attraction,
            chemistry: scores.chemistry,
          },
        }
      );

      // Mark both feedback records as CSS-generated
      await ctx.runMutation(
        internal.dateFeedback.mutations.markCssGenerated,
        { feedbackIds: [feedbackA._id, feedbackB._id] }
      );

      // Upload CSS summary to SMA notes for both members
      for (const member of [memberA, memberB]) {
        const otherMember = member._id === memberA._id ? memberB : memberA;
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.smartmatchapp.notes.uploadNotesToSma,
          {
            matchId: args.matchId,
            memberId: member._id,
            decision: "date_feedback_css",
            cssData: {
              score: scores.overallScore,
              dimensions: {
                lifestyle: scores.lifestyle,
                energy: scores.energy,
                values: scores.values,
                attraction: scores.attraction,
                chemistry: scores.chemistry,
              },
              summary: scores.summary,
              strengths: scores.strengths,
              weaknesses: scores.weaknesses,
              partnerName: otherMember.firstName,
            },
          }
        );
      }

      // Check for mutual positive → mark active relationship
      if (
        feedbackA.overallRating === "great_chemistry" &&
        feedbackB.overallRating === "great_chemistry" &&
        feedbackA.wouldSeeAgain !== false &&
        feedbackB.wouldSeeAgain !== false
      ) {
        await ctx.runMutation(
          internal.dateFeedback.mutations.updateMatchCss,
          {
            matchId: args.matchId,
            cssScore: scores.overallScore,
            cssDimensions: {
              lifestyle: scores.lifestyle,
              energy: scores.energy,
              values: scores.values,
              attraction: scores.attraction,
              chemistry: scores.chemistry,
            },
            status: "active_relationship",
          }
        );
      }

      console.log(
        `CSS generated for match ${args.matchId}: ${scores.overallScore}/10 ` +
        `(${memberA.firstName}: ${feedbackA.overallRating}, ${memberB.firstName}: ${feedbackB.overallRating})`
      );

      return { generated: true, overallScore: scores.overallScore };
    } catch (error: any) {
      console.error("CSS generation failed:", error?.message);
      return { generated: false, reason: "error", error: error?.message };
    }
  },
});
