// @ts-nocheck
"use node";
/**
 * OpenRouter LLM Feedback Analysis
 *
 * Sends free-text feedback to an LLM via OpenRouter to extract structured
 * categories, sentiment, key themes, and a matchmaker summary.
 *
 * Runs asynchronously after feedback is saved — no user-facing impact on failure.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "./config";

const SYSTEM_PROMPT = `You are an assistant for a matchmaking service. Analyze the member's free-text feedback about why they declined a match.

Return ONLY valid JSON with this exact structure:
{
  "matchedCategories": ["category1", "category2"],
  "sentiment": "negative" | "neutral" | "mixed",
  "keyThemes": ["theme1", "theme2"],
  "matchmakerSummary": "One sentence summary for the matchmaker."
}

Categories to choose from: physical, location, career, age, religion, lifestyle, personality, bio, values, other.
Only include categories that the text clearly references. If none match, use ["other"].
The matchmakerSummary should be concise, professional, and useful for a matchmaker reviewing this feedback.`;

export const analyzeFeedback = internalAction({
  args: {
    feedbackId: v.id("feedback"),
    freeText: v.string(),
    existingCategories: v.optional(v.array(v.string())),
    decision: v.optional(v.string()),
    memberFirstName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = getOpenRouterApiKey();

      // Build the user prompt with context
      let userPrompt = `Member's free-text feedback: "${args.freeText}"`;
      if (args.decision) {
        userPrompt += `\nDecision: ${args.decision}`;
      }
      if (args.existingCategories && args.existingCategories.length > 0) {
        userPrompt += `\nAlready selected categories: ${args.existingCategories.join(", ")}`;
      }
      if (args.memberFirstName) {
        userPrompt += `\nMember's first name: ${args.memberFirstName}`;
      }

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}`
        );
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("OpenRouter returned empty content");
      }

      // Parse the JSON response, with regex fallback for code-fenced output
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch {
        // Try extracting JSON from markdown code fences
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[1].trim());
        } else {
          throw new Error("Could not parse LLM response as JSON");
        }
      }

      // Validate and set defaults for the expected structure
      const validSentiments = ["negative", "neutral", "mixed"];
      const result = {
        matchedCategories: Array.isArray(analysis.matchedCategories)
          ? analysis.matchedCategories
          : ["other"],
        sentiment: validSentiments.includes(analysis.sentiment)
          ? analysis.sentiment
          : "neutral",
        keyThemes: Array.isArray(analysis.keyThemes)
          ? analysis.keyThemes
          : [],
        matchmakerSummary:
          typeof analysis.matchmakerSummary === "string"
            ? analysis.matchmakerSummary
            : "Free-text feedback provided; see raw text for details.",
        analyzedAt: Date.now(),
      };

      // Patch the feedback record with the analysis
      await ctx.runMutation(
        internal.integrations.openrouter.callbacks.updateFeedbackAnalysis,
        {
          feedbackId: args.feedbackId,
          llmAnalysis: result,
        }
      );
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown analysis error";
      console.error("OpenRouter feedback analysis failed:", errorMessage);

      // Store the error on the feedback record — no user-facing impact
      await ctx.runMutation(
        internal.integrations.openrouter.callbacks.updateFeedbackAnalysis,
        {
          feedbackId: args.feedbackId,
          llmAnalysis: {
            error: errorMessage,
            analyzedAt: Date.now(),
          },
        }
      );
    }
  },
});
