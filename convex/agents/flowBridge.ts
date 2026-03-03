// @ts-nocheck
/**
 * Flow Bridge — Connects the AI Agent to the Flow Engine
 *
 * This module bridges the data-driven flow engine (convex/engine/) with the
 * Agent Matcha AI system. It provides three key capabilities:
 *
 * 1. personalizeMessage — Takes a message template + member context and asks
 *    the AI to generate a warm, personalized version.
 *
 * 2. interpretResponse — Takes a member's free-text WhatsApp reply and uses
 *    the AI to classify it into one of the flow's expected options.
 *
 * 3. generateFollowUp — Generates a contextual follow-up message when the
 *    flow engine needs one (e.g., after a delay or when re-engaging).
 *
 * All three are internalActions so they can make AI calls (non-deterministic).
 * The flow engine executor can optionally invoke these before sending messages
 * or after receiving free-text input.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

import { matchaAgent, classifierAgent, personalizerAgent } from "./matchaAgent";
import { TEMPERATURE, FEATURE_FLAGS } from "./config";

// ============================================================================
// personalizeMessage
// ============================================================================

/**
 * Takes a raw message template and member/match context, then asks the AI
 * personalizer to generate a warm, WhatsApp-appropriate version.
 *
 * If AI personalization is disabled (feature flag), returns the original
 * template with basic variable substitution applied.
 *
 * Called by the flow engine executor before logging outbound messages.
 */
export const personalizeMessage = internalAction({
  args: {
    /** The raw message template, e.g. "Hi {{memberName}}, we have a match for you!" */
    template: v.string(),

    /** Member context for personalization */
    memberContext: v.object({
      memberId: v.string(),
      memberName: v.string(),
      tier: v.optional(v.string()),
    }),

    /** Match context (optional — not all messages are match-related) */
    matchContext: v.optional(
      v.object({
        matchId: v.string(),
        matchName: v.optional(v.string()),
        matchStatus: v.optional(v.string()),
      }),
    ),

    /** Recent conversation messages for tone/context (optional) */
    conversationHistory: v.optional(v.array(v.string())),

    /** The agent thread ID to use (optional — creates ephemeral if not provided) */
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check feature flag
    if (!FEATURE_FLAGS.useAiPersonalization) {
      // Just do basic template substitution
      return {
        personalizedMessage: basicSubstitution(args.template, args.memberContext, args.matchContext),
        wasPersonalized: false,
      };
    }

    // Build the prompt for the personalizer
    const contextLines = [
      `Member name: ${args.memberContext.memberName}`,
      args.memberContext.tier ? `Membership tier: ${args.memberContext.tier}` : null,
      args.matchContext?.matchName
        ? `Match name: ${args.matchContext.matchName}`
        : null,
      args.matchContext?.matchStatus
        ? `Match status: ${args.matchContext.matchStatus}`
        : null,
    ].filter(Boolean);

    const historyBlock =
      args.conversationHistory && args.conversationHistory.length > 0
        ? `\n\nRecent conversation:\n${args.conversationHistory.map((m) => `- ${m}`).join("\n")}`
        : "";

    const prompt = `Personalize this message template for a WhatsApp conversation:

Template: "${args.template}"

Context:
${contextLines.join("\n")}${historyBlock}

Generate a warm, natural personalized version. Return ONLY the message text.`;

    try {
      // Use the personalizer agent (or ephemeral call without a thread)
      const result = await personalizerAgent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt,
          temperature: TEMPERATURE.personalization,
        },
        {
          // Don't save these ephemeral personalization calls to the thread
          storageOptions: { saveMessages: args.threadId ? "promptAndOutput" : "none" },
        },
      );

      return {
        personalizedMessage: result.text.trim(),
        wasPersonalized: true,
      };
    } catch (error) {
      console.error("AI personalization failed, falling back to template:", error);
      return {
        personalizedMessage: basicSubstitution(args.template, args.memberContext, args.matchContext),
        wasPersonalized: false,
        error: String(error),
      };
    }
  },
});

// ============================================================================
// interpretResponse
// ============================================================================

/**
 * Takes a member's free-text WhatsApp response and classifies it into one
 * of the flow's expected options.
 *
 * The flow engine's decision nodes expect specific values like "interested",
 * "not_interested", "reschedule", etc. When a member sends free text like
 * "hmm I'm not really feeling it tbh", this function maps it to the right
 * option.
 *
 * Returns:
 *   - classification: the matched option value (or "unclear" if ambiguous)
 *   - confidence: low/medium/high
 *   - reasoning: brief explanation of the classification
 */
export const interpretResponse = internalAction({
  args: {
    /** The raw text the member sent */
    memberResponse: v.string(),

    /** The expected options the flow is waiting for */
    expectedOptions: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
      }),
    ),

    /** Context about what the question was */
    questionContext: v.optional(v.string()),

    /** Member name for context */
    memberName: v.optional(v.string()),

    /** Optional thread ID for conversation history context */
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check feature flag
    if (!FEATURE_FLAGS.useAiClassification) {
      // Fall back to exact match only
      return {
        classification: null,
        confidence: "none" as const,
        reasoning: "AI classification disabled — using exact match only",
      };
    }

    const optionsList = args.expectedOptions
      .map((opt) => `- "${opt.value}" (${opt.label})`)
      .join("\n");

    const prompt = `A Club Allenby member${args.memberName ? ` (${args.memberName})` : ""} sent this WhatsApp message:

"${args.memberResponse}"

${args.questionContext ? `They were asked: "${args.questionContext}"\n` : ""}
The expected response options are:
${optionsList}

Classify their response into ONE of the option values listed above.
If the response is ambiguous, off-topic, or doesn't fit any option, respond with "unclear".

Respond with ONLY a JSON object in this format:
{"classification": "<option_value>", "confidence": "low|medium|high", "reasoning": "<brief explanation>"}`;

    try {
      const result = await classifierAgent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt,
          temperature: TEMPERATURE.classification,
        },
        {
          storageOptions: { saveMessages: "none" },
        },
      );

      // Parse the JSON response
      const text = result.text.trim();
      try {
        // Try to extract JSON from the response (the model might wrap it)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            classification: parsed.classification || null,
            confidence: parsed.confidence || "low",
            reasoning: parsed.reasoning || "No reasoning provided",
          };
        }
      } catch {
        // If JSON parsing fails, try to extract just the classification
        const validValues = args.expectedOptions.map((o) => o.value);
        const foundValue = validValues.find(
          (val) => text.toLowerCase().includes(val.toLowerCase()),
        );
        if (foundValue) {
          return {
            classification: foundValue,
            confidence: "low",
            reasoning: `Extracted from non-JSON response: "${text}"`,
          };
        }
      }

      return {
        classification: "unclear",
        confidence: "low",
        reasoning: `Could not parse AI response: "${text}"`,
      };
    } catch (error) {
      console.error("AI classification failed:", error);
      return {
        classification: null,
        confidence: "none" as const,
        reasoning: `AI classification error: ${String(error)}`,
      };
    }
  },
});

// ============================================================================
// generateFollowUp
// ============================================================================

/**
 * Generates a contextual follow-up message when the flow engine needs one.
 * Used after delays, reminders, or when re-engaging a member who hasn't
 * responded.
 *
 * The generated message is WhatsApp-appropriate and considers:
 *   - How long since the last message
 *   - What the flow is waiting for
 *   - The member's tone in previous messages
 */
export const generateFollowUp = internalAction({
  args: {
    /** Why we're following up */
    reason: v.union(
      v.literal("delay_expired"),
      v.literal("reminder"),
      v.literal("re_engage"),
      v.literal("post_feedback"),
    ),

    /** Member context */
    memberContext: v.object({
      memberId: v.string(),
      memberName: v.string(),
      tier: v.optional(v.string()),
    }),

    /** Match context (optional) */
    matchContext: v.optional(
      v.object({
        matchId: v.string(),
        matchName: v.optional(v.string()),
        matchStatus: v.optional(v.string()),
      }),
    ),

    /** What the flow is currently waiting for */
    waitingFor: v.optional(v.string()),

    /** Time since last message in milliseconds */
    timeSinceLastMessage: v.optional(v.number()),

    /** Recent conversation for context */
    conversationHistory: v.optional(v.array(v.string())),

    /** Agent thread ID for full context */
    threadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check feature flag
    if (!FEATURE_FLAGS.useAiFollowUp) {
      return {
        followUpMessage: getDefaultFollowUp(args.reason, args.memberContext.memberName),
        wasGenerated: false,
      };
    }

    const timeSinceStr = args.timeSinceLastMessage
      ? formatDuration(args.timeSinceLastMessage)
      : "unknown";

    const historyBlock =
      args.conversationHistory && args.conversationHistory.length > 0
        ? `\nRecent messages:\n${args.conversationHistory.map((m) => `- ${m}`).join("\n")}`
        : "";

    const prompt = `Generate a WhatsApp follow-up message for a Club Allenby member.

Reason for follow-up: ${args.reason}
Member: ${args.memberContext.memberName}
${args.memberContext.tier ? `Tier: ${args.memberContext.tier}` : ""}
${args.matchContext?.matchName ? `Match: ${args.matchContext.matchName}` : ""}
${args.matchContext?.matchStatus ? `Match status: ${args.matchContext.matchStatus}` : ""}
Time since last message: ${timeSinceStr}
${args.waitingFor ? `Waiting for: ${args.waitingFor}` : ""}${historyBlock}

Generate a warm, brief follow-up message. Be respectful of their time.
If it's been a while, acknowledge that gently.
Return ONLY the message text.`;

    try {
      const result = await matchaAgent.generateText(
        ctx,
        { threadId: args.threadId },
        {
          prompt,
          temperature: TEMPERATURE.followUp,
        },
        {
          storageOptions: { saveMessages: args.threadId ? "promptAndOutput" : "none" },
        },
      );

      return {
        followUpMessage: result.text.trim(),
        wasGenerated: true,
      };
    } catch (error) {
      console.error("AI follow-up generation failed:", error);
      return {
        followUpMessage: getDefaultFollowUp(args.reason, args.memberContext.memberName),
        wasGenerated: false,
        error: String(error),
      };
    }
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Basic template substitution without AI.
 * Replaces {{memberName}}, {{matchName}}, {{tier}} with context values.
 */
function basicSubstitution(
  template: string,
  memberContext: { memberName: string; tier?: string },
  matchContext?: { matchName?: string; matchStatus?: string },
): string {
  let result = template;
  result = result.replace(/\{\{memberName\}\}/g, memberContext.memberName);
  result = result.replace(/\{\{tier\}\}/g, memberContext.tier || "member");
  if (matchContext) {
    result = result.replace(
      /\{\{matchName\}\}/g,
      matchContext.matchName || "your match",
    );
    result = result.replace(
      /\{\{matchStatus\}\}/g,
      matchContext.matchStatus || "",
    );
  }
  return result;
}

/**
 * Default follow-up messages when AI is disabled.
 */
function getDefaultFollowUp(
  reason: string,
  memberName: string,
): string {
  switch (reason) {
    case "delay_expired":
      return `Hi ${memberName}! Just checking in — we'd love to hear your thoughts whenever you're ready.`;
    case "reminder":
      return `Hey ${memberName}, friendly reminder — we're still here whenever you'd like to share your feedback!`;
    case "re_engage":
      return `Hi ${memberName}! It's been a little while. No pressure at all — just wanted to let you know we're here if you'd like to continue.`;
    case "post_feedback":
      return `Thanks so much for your feedback, ${memberName}! We really appreciate it. We'll keep working on finding your perfect match.`;
    default:
      return `Hi ${memberName}, just checking in!`;
  }
}

/**
 * Format a millisecond duration into a human-readable string.
 */
function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / (1000 * 60));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? "s" : ""}`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  return "just now";
}
