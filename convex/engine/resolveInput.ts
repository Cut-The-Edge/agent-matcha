// @ts-nocheck
"use node";
/**
 * LLM-Powered Input Resolution
 *
 * When a member's reply doesn't match any option via quick matching
 * (numbered, exact, normalized), this action calls an LLM to determine
 * which option they meant. Handles typos, paraphrasing, voice
 * transcription artifacts, and natural language responses.
 *
 * Used for both DECISION nodes and FEEDBACK_COLLECT nodes:
 * - DECISION: resolved value passed directly (determines which edge to follow)
 * - FEEDBACK_COLLECT: resolved value wrapped in structured JSON (for data quality)
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "../integrations/openrouter/config";
import { TEMPERATURE } from "../agents/config";

export const resolveInputWithLLM = internalAction({
  args: {
    flowInstanceId: v.id("flowInstances"),
    rawInput: v.string(),
    options: v.array(
      v.object({ value: v.string(), label: v.string() })
    ),
    // When true, wrap the resolved value as structured feedback JSON
    // so the interpreter stores selectedOption/selectedLabel properly
    formatAsFeedbackJson: v.optional(v.boolean()),
    // Member ID for sending reprompt messages when LLM can't match
    memberId: v.optional(v.id("members")),
    // The question/prompt that was asked at the current node
    question: v.optional(v.string()),
    // Match ID for loading conversation history
    matchId: v.optional(v.id("matches")),
    // Serialized flow graph context (current node, options, downstream paths)
    flowGraphContext: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let resolvedValue: string | null = null;

    try {
      const apiKey = getOpenRouterApiKey();

      const optionsList = args.options
        .map((opt, i) => `${i + 1}. value="${opt.value}" (label: "${opt.label}")`)
        .join("\n");

      const response = await fetch(OPENROUTER_API_URL, {
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
              content:
                'You match a user\'s WhatsApp reply to the closest menu option. The reply might have typos, be a voice transcription, or be phrased naturally. Return ONLY the exact option "value" string that best matches. If the reply is completely unrelated to all options, return exactly "NONE".',
            },
            {
              role: "user",
              content: `User replied: "${args.rawInput}"\n\nAvailable options:\n${optionsList}\n\nReturn ONLY the matching value string:`,
            },
          ],
          temperature: 0,
          max_tokens: 50,
        }),
      });

      if (!response.ok) {
        console.error(
          `LLM resolution API error ${response.status}:`,
          await response.text().catch(() => "")
        );
      } else {
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content
          ?.trim()
          .replace(/^["']|["']$/g, ""); // strip quotes if LLM wraps them

        if (content === "NONE") {
          console.log(`LLM returned NONE for "${args.rawInput}" — no option matched`);
        }

        if (content && content !== "NONE") {
          // Clean up LLM response: strip quotes, "value=" prefix, whitespace
          const cleaned = content
            .replace(/^value\s*=\s*/i, "")  // strip "value=" prefix
            .replace(/^["'`]+|["'`]+$/g, "") // strip any wrapping quotes
            .trim()
            .toLowerCase();

          // 1. Exact match on value
          let matched = args.options.find(
            (opt) => opt.value.toLowerCase() === cleaned
          );

          // 2. Exact match on label (LLM often returns "Yes" instead of "more_reasons_yes")
          if (!matched) {
            matched = args.options.find(
              (opt) => opt.label.toLowerCase() === cleaned
            );
          }

          // 3. Bidirectional partial: option value contains response, or response contains value
          if (!matched) {
            matched = args.options.find(
              (opt) =>
                cleaned.includes(opt.value.toLowerCase()) ||
                opt.value.toLowerCase().includes(cleaned) ||
                cleaned.includes(opt.label.toLowerCase()) ||
                opt.label.toLowerCase().includes(cleaned)
            );
          }

          if (matched) {
            resolvedValue = matched.value;
            console.log(
              `LLM resolved "${args.rawInput}" → "${matched.value}" (raw LLM: "${content}")`
            );
          } else {
            console.warn(
              `LLM returned "${content}" which doesn't match any option`
            );
          }
        }
      }
    } catch (error: any) {
      console.error("LLM input resolution failed, using raw input:", error?.message);
    }

    // Build the input to pass to advanceFlow
    let advanceInput: string;

    if (resolvedValue && args.formatAsFeedbackJson) {
      // FEEDBACK_COLLECT: wrap as structured JSON so interpreter stores it properly
      const matchedOpt = args.options.find((o) => o.value === resolvedValue);
      advanceInput = JSON.stringify({
        selectedOption: resolvedValue,
        selectedLabel: matchedOpt?.label || resolvedValue,
        rawInput: args.rawInput,
      });
    } else if (resolvedValue) {
      // DECISION: pass the resolved option value directly
      advanceInput = resolvedValue;
    } else {
      // LLM couldn't match — use AI conversational fallback for BOTH
      // DECISION and FEEDBACK_COLLECT nodes. The AI sees the full flow
      // pipeline and can either:
      //   (a) pick an option to advance the flow, or
      //   (b) send a warm conversational response and keep waiting
      console.log(`[resolveInput] No match for "${args.rawInput}", trying AI conversational fallback`);

      if (args.memberId) {
        try {
          const aiResult = await generateConversationalFallback(ctx, args);

          // ── REWIND: member changed their mind → go back to a previous node ──
          if (aiResult?.rewind && aiResult.rewindToNodeId && aiResult.rewindOptionValue) {
            console.log(
              `[resolveInput] AI fallback rewinding: → ${aiResult.rewindToNodeId} with "${aiResult.rewindOptionValue}"`,
            );

            if (aiResult.message) {
              await sendWhatsAppToMember(ctx, args.memberId, aiResult.message, args.matchId);
            }

            await ctx.runMutation(internal.engine.transitions.rewindFlow, {
              flowInstanceId: args.flowInstanceId,
              targetNodeId: aiResult.rewindToNodeId,
              input: aiResult.rewindOptionValue,
              reason: `AI detected change of mind: "${args.rawInput.slice(0, 100)}"`,
            });
            return;
          }

          // ── ADVANCE: AI identified the intent → move forward ──
          if (aiResult?.advance && aiResult.optionValue) {
            console.log(`[resolveInput] AI fallback advancing flow: "${aiResult.optionValue}"`);

            // Store extracted feedback in flow context BEFORE advancing.
            // This allows downstream feedback nodes to auto-skip since data already exists.
            if (aiResult.extractedFeedback) {
              await ctx.runMutation(
                internal.engine.transitions.storeExtractedFeedback,
                {
                  flowInstanceId: args.flowInstanceId,
                  extractedFeedback: aiResult.extractedFeedback,
                },
              );
              console.log(
                `[resolveInput] Stored AI-extracted feedback: ${aiResult.extractedFeedback.categories.join(", ")}`,
              );
            }

            // Send the warm acknowledgment first so the member sees it before the next question
            if (aiResult.message) {
              await sendWhatsAppToMember(ctx, args.memberId, aiResult.message, args.matchId);
            }

            if (args.formatAsFeedbackJson) {
              const matchedOpt = args.options.find((o) => o.value === aiResult.optionValue);
              await ctx.runMutation(internal.engine.interpreter.advanceFlow, {
                flowInstanceId: args.flowInstanceId,
                input: JSON.stringify({
                  selectedOption: aiResult.optionValue,
                  selectedLabel: matchedOpt?.label || aiResult.optionValue,
                  rawInput: args.rawInput,
                }),
              });
            } else {
              await ctx.runMutation(internal.engine.interpreter.advanceFlow, {
                flowInstanceId: args.flowInstanceId,
                input: aiResult.optionValue,
              });
            }
            return;
          }

          // ── RESPOND: AI keeps the conversation going without routing ──
          if (aiResult?.message) {
            await sendWhatsAppToMember(ctx, args.memberId, aiResult.message, args.matchId);
          }
          // Store partial feedback if available (accumulates across turns)
          if (aiResult?.extractedFeedback) {
            await ctx.runMutation(
              internal.engine.transitions.storeExtractedFeedback,
              {
                flowInstanceId: args.flowInstanceId,
                extractedFeedback: aiResult.extractedFeedback,
              },
            );
          }
        } catch (error: any) {
          console.error("[resolveInput] AI fallback failed:", error?.message);
          // Last resort: warm message instead of the robotic legacy reprompt
          await sendWhatsAppToMember(
            ctx,
            args.memberId,
            "Hey, give me just a moment — I want to make sure I understand you correctly 😊",
          );
        }
      }
      // Don't advance flow — keep waiting for valid input
      return;
    }

    await ctx.runMutation(internal.engine.interpreter.advanceFlow, {
      flowInstanceId: args.flowInstanceId,
      input: advanceInput,
    });
  },
});

// ============================================================================
// Payment-Waiting Input Handler
// ============================================================================

/**
 * Handle member text while the flow is paused waiting for Stripe payment.
 * Uses LLM to detect cancel intent — if the member wants to bail, rewind
 * to the decision node and pick the "pass" option. Otherwise, send a warm
 * message reminding them the payment link is waiting.
 */
export const resolvePaymentWaitingInput = internalAction({
  args: {
    flowInstanceId: v.id("flowInstances"),
    memberId: v.id("members"),
    rawInput: v.string(),
    matchId: v.optional(v.id("matches")),
  },
  handler: async (ctx, args) => {
    try {
      const apiKey = getOpenRouterApiKey();

      // Ask LLM: does the member want to cancel/pass on payment?
      const response = await fetch(OPENROUTER_API_URL, {
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
              content:
                'A matchmaking club member is waiting to complete a payment. Determine if their message means they want to CANCEL (not pay, pass, changed their mind, not interested anymore) or if they are just asking a QUESTION or chatting. Return ONLY "CANCEL" or "QUESTION".',
            },
            {
              role: "user",
              content: `Member said: "${args.rawInput}"`,
            },
          ],
          temperature: 0,
          max_tokens: 10,
        }),
      });

      let intent = "QUESTION";
      if (response.ok) {
        const data = await response.json();
        const content = (data?.choices?.[0]?.message?.content || "")
          .trim()
          .toUpperCase();
        if (content.includes("CANCEL")) {
          intent = "CANCEL";
        }
      }

      if (intent === "CANCEL") {
        // Determine which decision node to rewind to based on flow context
        const instance = await ctx.runQuery(
          internal.engine.transitions.getFlowInstance,
          { flowInstanceId: args.flowInstanceId },
        );
        const flowContext = instance?.context as any;
        const responses = flowContext?.responses || {};

        // Find the right rewind target: interested flow or upsell flow
        let rewindNodeId: string;
        let rewindOptionValue: string;

        if (responses.decision_interested_outreach) {
          rewindNodeId = "decision_interested_outreach";
          rewindOptionValue = "interested_pass";
        } else if (responses.decision_upsell) {
          rewindNodeId = "decision_upsell";
          rewindOptionValue = "upsell_no";
        } else {
          // Fallback: just send a message, don't rewind
          await sendWhatsAppToMember(
            ctx,
            args.memberId,
            "No worries at all! I'll let the team know. Thanks for being honest 💛",
            args.matchId,
          );
          return;
        }

        // Send acknowledgment
        await sendWhatsAppToMember(
          ctx,
          args.memberId,
          "Totally understand — no pressure at all! I'll note that down 💛",
          args.matchId,
        );

        // Cancel the pending payment record
        if (instance?.matchId) {
          await ctx.runMutation(
            internal.engine.transitions.cancelPendingPayment,
            { flowInstanceId: args.flowInstanceId },
          );
        }

        // Rewind to the decision node with the "pass" option
        await ctx.runMutation(internal.engine.transitions.rewindFlow, {
          flowInstanceId: args.flowInstanceId,
          targetNodeId: rewindNodeId,
          input: rewindOptionValue,
          reason: `Member declined payment: "${args.rawInput.slice(0, 100)}"`,
        });

        console.log(
          `[resolvePaymentInput] Member cancelled payment, rewinding to ${rewindNodeId} with "${rewindOptionValue}"`,
        );
      } else {
        // Not cancelling — send a warm reminder about the payment link
        await sendWhatsAppToMember(
          ctx,
          args.memberId,
          "Hey! Just a heads up — the payment link I sent is still active whenever you're ready. Take your time, no rush 😊 If you have any questions, feel free to ask!",
          args.matchId,
        );
      }
    } catch (error: any) {
      console.error("[resolvePaymentInput] Error:", error?.message);
      // Fallback: still send something helpful
      await sendWhatsAppToMember(
        ctx,
        args.memberId,
        "Hey! The payment link I sent is still active whenever you're ready. If you changed your mind, just let me know 😊",
        args.matchId,
      );
    }
  },
});

// ============================================================================
// AI Conversational Fallback
// ============================================================================

interface ExtractedFeedback {
  /** Primary rejection categories the member mentioned (physical, bio, career, etc.) */
  categories: string[];
  /** Sub-category details mapped by category */
  subCategories: Record<string, string>;
  /** Free-text summary of what the member said in their own words */
  freeText: string;
  /** Member's emotional tone: firm, soft, conflicted, frustrated, neutral */
  sentiment: string;
  /** Whether the AI thinks it needs more info from the member */
  needsFollowUp: boolean;
}

interface FallbackResult {
  advance: boolean;
  optionValue?: string;
  message: string;
  /** Structured feedback extracted from the member's message */
  extractedFeedback?: ExtractedFeedback;
  /** When true, the AI wants to rewind to a previous node (member changed their mind) */
  rewind?: boolean;
  /** The node ID to rewind to (e.g., "decision_response") */
  rewindToNodeId?: string;
  /** The option value to select at the rewind target */
  rewindOptionValue?: string;
}

/**
 * Generate a conversational response via OpenRouter when the simple LLM
 * matcher returns NONE. The AI sees the flow pipeline context and can
 * either pick an option to advance, rewind, or respond conversationally.
 */
async function generateConversationalFallback(
  ctx: any,
  args: {
    rawInput: string;
    options: { value: string; label: string }[];
    memberId?: any;
    question?: string;
    matchId?: any;
    flowGraphContext?: string;
  },
): Promise<FallbackResult | null> {
  // Load recent conversation history
  let conversationHistory = "";
  if (args.memberId) {
    try {
      const recentMessages = await ctx.runQuery(
        internal.engine.transitions.getRecentMessages,
        { memberId: args.memberId, limit: 10 },
      );
      if (recentMessages && recentMessages.length > 0) {
        // Reverse to chronological order
        const sorted = [...recentMessages].reverse();
        conversationHistory = sorted
          .map((m: any) => `${m.direction === "inbound" ? "Member" : "Bot"}: ${m.content}`)
          .join("\n");
      }
    } catch (e) {
      console.warn("[resolveInput] Could not load conversation history:", e);
    }
  }

  const optionsList = args.options
    .map((opt) => `- "${opt.label}" (value: ${opt.value})`)
    .join("\n");

  const prompt = `You are Agent Matcha, a real human matchmaker at Club Allenby, chatting with a member on WhatsApp. You are NOT a bot — you're warm, empathetic, and genuinely care about this person's experience.

A member just replied to you in a way that needs a human touch. Read the full conversation, understand their feelings, and respond like a real person would.

${conversationHistory ? `=== Conversation so far ===\n${conversationHistory}\n` : ""}
=== Their latest message ===
"${args.rawInput}"

${args.question ? `=== What you asked them ===\n"${args.question}"\n` : ""}
=== Where you are in the flow ===
${args.flowGraphContext || "No flow context available."}

=== Available options to move forward ===
${optionsList}

=== Feedback categories you should look for ===
If the member is expressing disinterest or giving feedback about a match, extract any of these:
- "physical" — physical attraction, type, looks, photos
- "bio" — bio didn't resonate, values, depth, compatibility from profile
- "career" — career ambitions, income, industry, work-life balance
- "religious" — religious level, observance style mismatch
- "age" — age preference, life stage, maturity, marriage/kids timeline
- "location" — distance, city preference, relocation
- "gut_feeling" — can't explain it, just didn't feel it, no excitement
- "other" — something else entirely

=== Your job ===
You are having a REAL conversation. Read everything they said carefully.

1. UNDERSTAND what they're telling you — their feelings, their reasons, their tone
2. EXTRACT any feedback data from their message (categories, details, sentiment)
3. RESPOND like a real person — validate, empathize, engage
4. DECIDE: Do you have enough info, or should you dig deeper?

If they wrote a lot (reasons, feelings, details) — you probably have enough. Acknowledge what they shared, respond warmly, and advance. Don't ask "what didn't feel right?" when they just told you.

If they were vague ("not interested" with no detail) — have a real conversation. Ask what didn't click. Be curious, not interrogative. Stay at this node and gather more before advancing.

If they're off-topic, chatting, or asking questions — respond naturally, then gently guide back.

If they CHANGED THEIR MIND — e.g., they said "not interested" before but now say "actually, I looked again and she's pretty cute, maybe I am interested" — you can GO BACK to a previous decision and pick a different option. Check the "You can GO BACK" section in the flow context for available rewind targets.

=== Response format (JSON only) ===

When you have enough info and are ready to move forward:
{"advance": true, "optionValue": "<exact option value>", "message": "<warm response>", "extractedFeedback": {"categories": ["physical", "bio"], "subCategories": {"physical": "Not their type physically", "bio": "Felt generic and shallow"}, "freeText": "<member's feedback in their own words — preserve their voice>", "sentiment": "firm|soft|conflicted|frustrated|neutral", "needsFollowUp": false}}

When you need to keep talking to understand more:
{"advance": false, "message": "<your natural follow-up question or response>", "extractedFeedback": {"categories": ["physical"], "subCategories": {}, "freeText": "<what you know so far>", "sentiment": "neutral", "needsFollowUp": true}}

When the member changed their mind and you need to GO BACK:
{"rewind": true, "rewindToNodeId": "<node ID from the GO BACK list>", "rewindOptionValue": "<option value at that node>", "message": "<warm acknowledgment of their change of heart>"}

When it's off-topic / no feedback to extract:
{"advance": false, "message": "<your natural response>"}

Rules:
- You are a REAL PERSON. Never say "please select an option" or list choices like a menu
- Keep it WhatsApp-style: concise, warm, maybe an emoji if it fits naturally
- If they're upset or frustrated, show empathy first — don't rush to redirect
- If they gave detailed reasons, DON'T ask "what didn't feel right?" — they just told you
- Preserve the member's voice in freeText — use their words, not your paraphrase
- When you advance with extractedFeedback, downstream questions about "why" will be auto-skipped since you already captured it
- Use rewind ONLY when the member genuinely changed their mind, not for ambiguity
- Return ONLY valid JSON, no markdown fences or extra text`;

  // Use raw fetch to OpenRouter — avoids Agent SDK's userId/threadId requirement
  // since this is a stateless one-shot prompt (no conversation thread needed).
  const apiKey = getOpenRouterApiKey();
  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openai/gpt-4o",
      messages: [
        { role: "user", content: prompt },
      ],
      temperature: TEMPERATURE.conversation,
      max_tokens: 800,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter AI fallback error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = (data?.choices?.[0]?.message?.content || "").trim();
  try {
    // Strip markdown code fences if the LLM wraps them
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned) as FallbackResult;

    // Validate optionValue if advancing
    if (parsed.advance && parsed.optionValue) {
      const validOption = args.options.find(
        (o) => o.value.toLowerCase() === parsed.optionValue!.toLowerCase(),
      );
      if (!validOption) {
        console.warn(
          `[resolveInput] AI picked invalid option "${parsed.optionValue}", falling back to respond`,
        );
        return { advance: false, message: parsed.message || "" };
      }
      parsed.optionValue = validOption.value; // normalize casing
    }

    return parsed;
  } catch (e) {
    // If JSON parsing fails, treat the entire text as a conversational response
    console.warn("[resolveInput] AI fallback returned non-JSON, using as message:", text);
    return { advance: false, message: text };
  }
}

/**
 * Send a WhatsApp text message to a member, logging it in whatsappMessages.
 */
async function sendWhatsAppToMember(
  ctx: any,
  memberId: any,
  body: string,
  matchId?: any,
): Promise<void> {
  const member = await ctx.runQuery(
    internal.integrations.twilio.lookups.findMemberById,
    { memberId },
  );
  const phone = member?.whatsappId || member?.phone;

  // Log the outbound message and capture ID for delivery tracking
  let whatsappMessageId: any;
  if (memberId) {
    whatsappMessageId = await ctx.runMutation(
      internal.engine.transitions.logOutboundMessage,
      { memberId, matchId, content: body },
    );
  }

  if (phone) {
    await ctx.runAction(
      internal.integrations.twilio.whatsapp.sendTextMessage,
      { to: phone, body, ...(whatsappMessageId ? { whatsappMessageId } : {}) },
    );
  }
}
