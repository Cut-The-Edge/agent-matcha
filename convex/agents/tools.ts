// @ts-nocheck
/**
 * Shared Agent Tools
 *
 * Re-exports the tools defined on the Agent Matcha agent instance,
 * plus any additional shared utilities used by both matchFeedback
 * and introFacilitator agents.
 *
 * The core tools (lookupMember, getMatchDetails, recordFeedback, etc.)
 * are defined directly on the matchaAgent in matchaAgent.ts.
 * This file provides standalone tool creators for use in other agents.
 */

import { createTool } from "@convex-dev/agent";
import { z } from "zod/v3";

// ============================================================================
// Re-export tools from the main agent for convenience
// ============================================================================

export {
  matchaAgent,
  classifierAgent,
  personalizerAgent,
} from "./matchaAgent";

// ============================================================================
// Additional shared tools
// ============================================================================

/**
 * formatMemberProfile — Format a member's profile data into a readable string
 * for injecting into prompts.
 */
export const formatMemberProfile = createTool({
  description:
    "Format a member's profile into a concise, readable summary for use in messages or AI prompts.",
  args: z.object({
    firstName: z.string(),
    lastName: z.string().optional(),
    tier: z.string().optional(),
    status: z.string().optional(),
    rejectionCount: z.number().optional(),
  }),
  handler: async (ctx, args): Promise<string> => {
    const name = `${args.firstName}${args.lastName ? ` ${args.lastName}` : ""}`;
    const lines = [
      `Name: ${name}`,
      args.tier ? `Tier: ${args.tier}` : null,
      args.status ? `Status: ${args.status}` : null,
      args.rejectionCount !== undefined
        ? `Previous passes: ${args.rejectionCount}`
        : null,
    ].filter(Boolean);

    return lines.join("\n");
  },
});

/**
 * detectSentiment — Analyze the sentiment of a member's message.
 * Returns positive, neutral, negative, or frustrated.
 */
export const detectSentiment = createTool({
  description:
    "Analyze the sentiment/tone of a member's message to determine if they're positive, neutral, negative, or frustrated. Used to decide if escalation to Dani is needed.",
  args: z.object({
    message: z.string().describe("The member's message to analyze"),
  }),
  handler: async (ctx, args): Promise<string> => {
    // Simple keyword-based sentiment as fallback
    // The AI agent can do better, but this provides a deterministic fallback
    const lower = args.message.toLowerCase();

    const frustratedKeywords = [
      "frustrated", "annoyed", "angry", "waste", "terrible",
      "horrible", "awful", "unsubscribe", "stop", "leave me alone",
      "ridiculous", "pathetic", "scam",
    ];
    const negativeKeywords = [
      "not interested", "no thanks", "pass", "decline",
      "don't want", "not for me", "meh", "nah",
    ];
    const positiveKeywords = [
      "interested", "excited", "love", "great", "amazing",
      "yes", "absolutely", "definitely", "perfect", "wonderful",
    ];

    if (frustratedKeywords.some((kw) => lower.includes(kw))) {
      return JSON.stringify({ sentiment: "frustrated", shouldEscalate: true });
    }
    if (negativeKeywords.some((kw) => lower.includes(kw))) {
      return JSON.stringify({ sentiment: "negative", shouldEscalate: false });
    }
    if (positiveKeywords.some((kw) => lower.includes(kw))) {
      return JSON.stringify({ sentiment: "positive", shouldEscalate: false });
    }

    return JSON.stringify({ sentiment: "neutral", shouldEscalate: false });
  },
});
