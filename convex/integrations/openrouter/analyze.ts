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

// ============================================================================
// Recalibration Analysis — Holistic summary across ALL rejections
// ============================================================================

const RECALIBRATION_SYSTEM_PROMPT = `You are an expert matchmaking analyst for Club Allenby, an exclusive Jewish singles matchmaking club. A member has declined 3+ matches and entered recalibration.

Analyze ALL their rejection feedback and conversations to identify patterns and provide actionable insights for the matchmaker's recalibration call.

Return ONLY valid JSON with this exact structure:
{
  "summary": "2-3 sentence insight for the matchmaker — specific, actionable, referencing concrete patterns",
  "keyPatterns": ["pattern1", "pattern2", "pattern3"]
}

The summary should answer: What is driving this member's rejections? What should the matchmaker focus on in the recalibration call?
The keyPatterns should be 2-4 short phrases identifying the main rejection themes.`;

export const analyzeRecalibration = internalAction({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = getOpenRouterApiKey();

      // 1. Load the member record
      const member = await ctx.runQuery(
        internal.members.queries.getInternal,
        { memberId: args.memberId },
      );
      if (!member) {
        console.error("[analyzeRecalibration] Member not found:", args.memberId);
        return;
      }

      // 2. Load all rejection feedback
      const feedbackRecords = await ctx.runQuery(
        internal.integrations.openrouter.callbacks.getFeedbackByMember,
        { memberId: args.memberId },
      );
      const rejections = feedbackRecords.filter(
        (f: any) => f.decision === "not_interested",
      );

      if (rejections.length === 0) {
        console.log("[analyzeRecalibration] No rejection feedback found for", args.memberId);
        return;
      }

      // 3. Load recent WhatsApp messages for conversational context
      const recentMessages = await ctx.runQuery(
        internal.engine.transitions.getRecentMessages,
        { memberId: args.memberId, limit: 50 },
      );

      // 4. Build the rich prompt
      let userPrompt = `Member: ${member.firstName} (${member.tier} tier)\n`;
      if (member.matchmakerNotes) {
        userPrompt += `Matchmaker notes: ${member.matchmakerNotes}\n`;
      }
      userPrompt += `Total rejections: ${rejections.length}\n\n`;

      for (let i = 0; i < rejections.length; i++) {
        const r = rejections[i];
        userPrompt += `=== Rejection #${i + 1} ===\n`;
        if (r.categories && r.categories.length > 0) {
          userPrompt += `Categories: ${r.categories.join(", ")}\n`;
        }
        if (r.freeText) {
          userPrompt += `Free text: "${r.freeText}"\n`;
        }
        if (r.llmAnalysis && typeof r.llmAnalysis === "object" && !r.llmAnalysis.error) {
          if (r.llmAnalysis.matchmakerSummary) {
            userPrompt += `LLM analysis: ${r.llmAnalysis.matchmakerSummary}\n`;
          }
          if (r.llmAnalysis.keyThemes && r.llmAnalysis.keyThemes.length > 0) {
            userPrompt += `Key themes: ${r.llmAnalysis.keyThemes.join(", ")}\n`;
          }
        }
        if (r.subCategories && typeof r.subCategories === "object") {
          const subs = Object.entries(r.subCategories)
            .map(([k, v]) => `${k}: ${v}`)
            .join("; ");
          if (subs) userPrompt += `Sub-categories: ${subs}\n`;
        }
        userPrompt += "\n";
      }

      // Add conversation excerpts
      if (recentMessages && recentMessages.length > 0) {
        userPrompt += "=== Recent conversation excerpts ===\n";
        const sorted = [...recentMessages].reverse();
        for (const msg of sorted.slice(0, 30)) {
          const dir = msg.direction === "inbound" ? "Member" : "Bot";
          userPrompt += `${dir}: ${msg.content.slice(0, 200)}\n`;
        }
      }

      // 5. Call OpenRouter
      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: "system", content: RECALIBRATION_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 600,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}`,
        );
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error("OpenRouter returned empty content");
      }

      // 6. Parse the JSON response
      let analysis;
      try {
        analysis = JSON.parse(content);
      } catch {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[1].trim());
        } else {
          throw new Error("Could not parse recalibration LLM response as JSON");
        }
      }

      const summary =
        typeof analysis.summary === "string"
          ? analysis.summary
          : "Multiple rejections recorded. Review feedback details for patterns.";
      const keyPatterns = Array.isArray(analysis.keyPatterns)
        ? analysis.keyPatterns.map(String)
        : [];

      // 7. Store on member record
      await ctx.runMutation(
        internal.members.mutations.updateRecalibrationSummary,
        {
          memberId: args.memberId,
          recalibrationSummary: {
            summary,
            keyPatterns,
            analyzedAt: Date.now(),
            feedbackCount: rejections.length,
          },
        },
      );

      console.log(
        `[analyzeRecalibration] Stored summary for ${member.firstName}: "${summary.slice(0, 80)}..."`,
      );
    } catch (error: any) {
      console.error(
        "[analyzeRecalibration] Failed for member",
        args.memberId,
        ":",
        error?.message,
      );
    }
  },
});
