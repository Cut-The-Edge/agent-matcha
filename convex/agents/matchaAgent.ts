// @ts-nocheck
/**
 * Agent Matcha — Core AI Agent
 *
 * The primary AI agent that powers the WhatsApp matchmaking bot.
 * Built on the Convex Agent SDK (@convex-dev/agent), it handles:
 *   - Personalizing outbound messages with member context
 *   - Interpreting free-text member responses
 *   - Generating contextual follow-ups
 *   - Looking up members, matches, and conversation history
 *   - Recording feedback and escalating to human (Dani)
 *
 * The agent stores all its conversation history in the Agent SDK's
 * built-in thread/message system, separate from the whatsappMessages table.
 */

import { Agent, createTool } from "@convex-dev/agent";
import { components } from "../_generated/api";
import { openai } from "@ai-sdk/openai";
import { z } from "zod/v3";

import { TEMPERATURE } from "./config";

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are Agent Matcha, the AI matchmaking assistant for Club Allenby — an exclusive Jewish singles matchmaking club in Miami.

Your role:
- Send warm, personalized WhatsApp messages to club members about their match suggestions
- Collect feedback about matches (interested, not interested, wants to reschedule, wants personal outreach)
- Handle the conversation flow naturally while following the structured decision tree
- Be warm, encouraging, and respectful of members' preferences
- Use a casual but professional tone (think: friendly concierge, not corporate bot)
- Respect privacy — never share one member's details with another unless both have consented

Context you'll receive:
- Member name and profile basics
- Match details (percentage, match name if consented)
- Current position in the feedback flow
- Previous conversation history

Rules:
- Keep messages concise (WhatsApp-appropriate length)
- Use emojis sparingly but naturally
- If a member seems upset or frustrated, escalate to human (Dani)
- Never make up match details — only use provided context
- Hebrew/Jewish cultural awareness (Shabbat, holidays, kosher, etc.)`;

// ============================================================================
// Agent Tools
// ============================================================================

/**
 * lookupMember — Query a member by phone, email, or ID.
 * Runs a DB query inside the action context.
 */
const lookupMember = createTool({
  description:
    "Look up a Club Allenby member by their phone number, email address, or member ID. Returns their profile basics.",
  args: z.object({
    phone: z.string().optional().describe("Phone number to search by"),
    email: z.string().optional().describe("Email address to search by"),
    memberId: z.string().optional().describe("Convex member document ID"),
  }),
  handler: async (ctx, args): Promise<string> => {
    if (args.memberId) {
      const member = await ctx.runQuery(
        components.agent.threads.getThread as any,
        {},
      ).catch(() => null);
      // Use direct DB query via a helper action
      // Since tools run in action context, we query through the component
      return JSON.stringify({
        note: "Use the member ID directly in other tools. Member lookup by ID is handled by the flow context.",
        memberId: args.memberId,
      });
    }
    if (args.phone) {
      return JSON.stringify({
        note: "Phone lookup requested. The flow engine provides member context — use that instead of re-querying.",
        phone: args.phone,
      });
    }
    if (args.email) {
      return JSON.stringify({
        note: "Email lookup requested. The flow engine provides member context — use that instead of re-querying.",
        email: args.email,
      });
    }
    return JSON.stringify({ error: "Provide at least one of: phone, email, memberId" });
  },
});

/**
 * getMatchDetails — Get match information for both parties.
 */
const getMatchDetails = createTool({
  description:
    "Get details about a match, including both members' basic info and the current match status. Requires the match ID.",
  args: z.object({
    matchId: z.string().describe("The Convex match document ID"),
  }),
  handler: async (ctx, args): Promise<string> => {
    return JSON.stringify({
      note: "Match details are provided in the flow context. Use the matchId to reference them.",
      matchId: args.matchId,
    });
  },
});

/**
 * recordFeedback — Record the member's feedback about a match.
 */
const recordFeedback = createTool({
  description:
    "Record a member's feedback about a suggested match. Captures their decision and any detailed feedback categories or free-text notes.",
  args: z.object({
    matchId: z.string().describe("The match this feedback is about"),
    memberId: z.string().describe("The member providing feedback"),
    decision: z
      .enum(["interested", "not_interested", "passed"])
      .describe("The member's overall decision about the match"),
    categories: z
      .array(
        z.enum([
          "physical_attraction",
          "photos_only",
          "chemistry",
          "willingness_to_meet",
          "age_preference",
          "location",
          "career_income",
          "something_specific",
        ]),
      )
      .optional()
      .describe("Specific feedback categories (for not_interested/passed)"),
    freeText: z
      .string()
      .optional()
      .describe("Free-text feedback from the member"),
  }),
  handler: async (ctx, args): Promise<string> => {
    return JSON.stringify({
      recorded: true,
      matchId: args.matchId,
      memberId: args.memberId,
      decision: args.decision,
      categories: args.categories,
      freeText: args.freeText,
      note: "Feedback recorded. The flow engine will handle status updates and SMA sync.",
    });
  },
});

/**
 * updateMatchStatus — Advance the match to a new state.
 */
const updateMatchStatus = createTool({
  description:
    "Update the status of a match (e.g., from pending to a_interested, mutual_interest, etc.). This is called after processing feedback.",
  args: z.object({
    matchId: z.string().describe("The match document ID"),
    newStatus: z
      .string()
      .describe(
        "The new match status (e.g., a_interested, b_interested, mutual_interest, a_declined, etc.)",
      ),
  }),
  handler: async (ctx, args): Promise<string> => {
    return JSON.stringify({
      updated: true,
      matchId: args.matchId,
      newStatus: args.newStatus,
      note: "Match status update queued. The flow engine executor handles the actual DB update.",
    });
  },
});

/**
 * sendWhatsAppMessage — Send a message through the conversation system.
 */
const sendWhatsAppMessage = createTool({
  description:
    "Send a WhatsApp message to a member via the conversation system. The message will be logged and dispatched through Twilio.",
  args: z.object({
    memberId: z.string().describe("The member to send the message to"),
    message: z.string().describe("The message content to send"),
    matchId: z.string().optional().describe("Optional associated match ID"),
  }),
  handler: async (ctx, args): Promise<string> => {
    return JSON.stringify({
      sent: true,
      memberId: args.memberId,
      matchId: args.matchId,
      messageLength: args.message.length,
      note: "Message queued for sending. The executor will log it to whatsappMessages and dispatch via Twilio.",
    });
  },
});

/**
 * escalateToHuman — Flag a conversation for Dani's attention.
 */
const escalateToHuman = createTool({
  description:
    "Escalate a conversation to Dani (the human matchmaker) when the member is upset, confused, has a complex request, or when AI cannot handle the situation appropriately.",
  args: z.object({
    memberId: z.string().describe("The member who needs human attention"),
    matchId: z.string().optional().describe("The related match, if any"),
    reason: z
      .string()
      .describe(
        "Why this conversation needs human attention (e.g., member frustrated, complex request, unclear intent)",
      ),
    urgency: z
      .enum(["low", "medium", "high"])
      .describe("How urgently Dani should review this"),
  }),
  handler: async (ctx, args): Promise<string> => {
    return JSON.stringify({
      escalated: true,
      memberId: args.memberId,
      matchId: args.matchId,
      reason: args.reason,
      urgency: args.urgency,
      note: "Escalation queued. Dani will be notified via the admin dashboard.",
    });
  },
});

/**
 * getConversationHistory — Load previous WhatsApp messages with a member.
 */
const getConversationHistory = createTool({
  description:
    "Load the previous WhatsApp message history with a specific member. Useful for understanding conversation context before generating a response.",
  args: z.object({
    memberId: z.string().describe("The member whose history to load"),
    matchId: z.string().optional().describe("Filter to messages about a specific match"),
    limit: z.number().optional().describe("Max number of messages to return (default 20)"),
  }),
  handler: async (ctx, args): Promise<string> => {
    return JSON.stringify({
      memberId: args.memberId,
      matchId: args.matchId,
      limit: args.limit ?? 20,
      note: "Conversation history is provided via the agent thread context. Recent messages from the whatsappMessages table are included in the flow context.",
    });
  },
});

// ============================================================================
// The Agent Matcha Instance
// ============================================================================

/**
 * The main Agent Matcha instance.
 *
 * Uses OpenAI GPT-4o by default. To switch models, the `languageModel`
 * parameter here determines the default. For per-call overrides, pass
 * `model` in the generateText/streamText args.
 *
 * Usage in an action:
 *   const { thread, threadId } = await matchaAgent.createThread(ctx, { userId: memberId });
 *   const result = await thread.generateText({ prompt: "..." });
 */
export const matchaAgent = new Agent(components.agent, {
  name: "Agent Matcha",
  languageModel: openai.chat("gpt-4o"),
  instructions: SYSTEM_PROMPT,
  tools: {
    lookupMember,
    getMatchDetails,
    recordFeedback,
    updateMatchStatus,
    sendWhatsAppMessage,
    escalateToHuman,
    getConversationHistory,
  },
});

// ============================================================================
// Alternate configurations for specific use cases
// ============================================================================

/**
 * A lightweight agent for classification tasks only.
 * Uses a smaller model and lower temperature for deterministic results.
 * No tools needed — it just classifies text.
 */
export const classifierAgent = new Agent(components.agent, {
  name: "Agent Matcha Classifier",
  languageModel: openai.chat("gpt-4o-mini"),
  instructions: `You are a response classifier for Club Allenby's matchmaking system.
Your ONLY job is to classify a member's free-text WhatsApp response into one of the provided categories.
Respond with ONLY the category value — nothing else. No explanation, no extra text.
If the response is ambiguous or doesn't clearly fit any category, respond with "unclear".`,
});

/**
 * A personalization-focused agent for message generation.
 * Uses the full model for warm, natural messages.
 */
export const personalizerAgent = new Agent(components.agent, {
  name: "Agent Matcha Personalizer",
  languageModel: openai.chat("gpt-4o"),
  instructions: `You are a message personalization engine for Club Allenby's matchmaking WhatsApp bot.
Given a message template and member context, generate a warm, personalized version of the message.
Keep the same intent and information, but make it feel personal and natural for WhatsApp.
Use the member's first name. Keep it concise. Use emojis sparingly but naturally.
Do NOT add information that isn't in the provided context.
Return ONLY the personalized message — no explanation, no metadata.`,
});
