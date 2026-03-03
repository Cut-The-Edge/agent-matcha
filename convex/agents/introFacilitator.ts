// @ts-nocheck
/**
 * Intro Facilitator Agent
 *
 * Manages introductions in WhatsApp group chats when there's mutual interest.
 * This agent is activated after both members have expressed interest in a match.
 *
 * It uses the core Agent Matcha to:
 *   - Generate warm, personalized introduction messages
 *   - Facilitate the initial group chat conversation
 *   - Suggest icebreakers based on both members' profiles
 *   - Monitor the group chat and escalate to Dani if needed
 *
 * The flow engine handles the structural logic (creating the group, sending
 * the intro message, checking for responses). This agent enhances the
 * messages with AI personalization.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

import { matchaAgent } from "./matchaAgent";
import { TEMPERATURE } from "./config";
import { FEATURE_FLAGS } from "./config";

// ============================================================================
// Introduction System Prompt Supplement
// ============================================================================

const INTRO_CONTEXT = `
You are now facilitating an introduction between two Club Allenby members
who have expressed mutual interest in each other. Your job is to:

1. Write a warm, exciting introduction message for the group chat
2. Share appropriate details that both members have consented to
3. Suggest a natural icebreaker or conversation starter
4. Be enthusiastic but not over-the-top
5. Respect the Jewish cultural context (mention Shabbat if relevant, etc.)

Keep the intro message concise — this is WhatsApp, not an email.
The goal is to make both members feel comfortable and excited to chat.
`;

// ============================================================================
// generateIntroMessage
// ============================================================================

/**
 * Generate a personalized introduction message for a mutual-interest group chat.
 * Takes both members' names and any shared interests/context to create
 * a warm, natural icebreaker.
 */
export const generateIntroMessage = internalAction({
  args: {
    matchId: v.id("matches"),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    memberAName: v.string(),
    memberBName: v.string(),
    template: v.optional(v.string()),
    agentThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!FEATURE_FLAGS.useAiPersonalization) {
      // Use template or default
      const defaultIntro = `Hi ${args.memberAName} and ${args.memberBName}! Great news — you've both expressed interest in getting to know each other! I'll let you two take it from here. Have fun! 🎉`;
      return {
        introMessage: args.template || defaultIntro,
        wasGenerated: false,
      };
    }

    const prompt = `Generate a WhatsApp group chat introduction message for two Club Allenby members who have mutual interest.

Member A: ${args.memberAName}
Member B: ${args.memberBName}

${INTRO_CONTEXT}

Write a brief, warm introduction that:
- Addresses both members by first name
- Expresses excitement about the mutual interest
- Suggests a natural conversation starter
- Keeps it to 2-3 short paragraphs max (WhatsApp-appropriate)

Return ONLY the message text.`;

    try {
      const result = await matchaAgent.generateText(
        ctx,
        { threadId: args.agentThreadId },
        {
          prompt,
          system: matchaAgent.options.instructions + "\n\n" + INTRO_CONTEXT,
          temperature: TEMPERATURE.personalization,
        },
        {
          storageOptions: {
            saveMessages: args.agentThreadId ? "promptAndOutput" : "none",
          },
        },
      );

      return {
        introMessage: result.text.trim(),
        wasGenerated: true,
      };
    } catch (error) {
      console.error("AI intro generation failed:", error);
      const fallback = `Hi ${args.memberAName} and ${args.memberBName}! Great news — you've both expressed interest in getting to know each other! I'll let you two take it from here. Have fun! 🎉`;
      return {
        introMessage: fallback,
        wasGenerated: false,
        error: String(error),
      };
    }
  },
});

// ============================================================================
// generateIcebreaker
// ============================================================================

/**
 * Generate an icebreaker suggestion if the group chat goes quiet.
 * Called by the flow engine after a delay if neither member has messaged.
 */
export const generateIcebreaker = internalAction({
  args: {
    matchId: v.id("matches"),
    memberAName: v.string(),
    memberBName: v.string(),
    timeSinceIntro: v.optional(v.number()),
    agentThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!FEATURE_FLAGS.useAiFollowUp) {
      return {
        icebreaker: `Hey ${args.memberAName} and ${args.memberBName}! Just a gentle nudge — don't be shy! Maybe start with what you love most about Miami? 😊`,
        wasGenerated: false,
      };
    }

    const timeStr = args.timeSinceIntro
      ? `It's been about ${Math.round(args.timeSinceIntro / (1000 * 60 * 60))} hours since the introduction.`
      : "";

    const prompt = `The group chat between ${args.memberAName} and ${args.memberBName} has been quiet. ${timeStr}

Generate a gentle, fun icebreaker message to encourage them to start chatting.
Don't be pushy. Be playful and light.
Maybe suggest a fun question they could ask each other.
Keep it to 1-2 sentences.

Return ONLY the message text.`;

    try {
      const result = await matchaAgent.generateText(
        ctx,
        { threadId: args.agentThreadId },
        {
          prompt,
          temperature: TEMPERATURE.followUp,
        },
        {
          storageOptions: { saveMessages: "none" },
        },
      );

      return {
        icebreaker: result.text.trim(),
        wasGenerated: true,
      };
    } catch (error) {
      console.error("AI icebreaker generation failed:", error);
      return {
        icebreaker: `Hey ${args.memberAName} and ${args.memberBName}! Just a gentle nudge — don't be shy! Maybe start with what you love most about Miami? 😊`,
        wasGenerated: false,
        error: String(error),
      };
    }
  },
});
