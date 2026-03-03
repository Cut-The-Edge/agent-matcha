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
    } else if (args.formatAsFeedbackJson) {
      // LLM couldn't match — store as freeText for feedback nodes
      advanceInput = JSON.stringify({ freeText: args.rawInput });
    } else {
      // LLM couldn't match at a DECISION node — send a reprompt so the
      // member knows to try again. Without this, the bot goes silent.
      console.log(`[resolveInput] No match for "${args.rawInput}", sending reprompt`);

      if (args.memberId) {
        const member = await ctx.runQuery(
          internal.integrations.twilio.lookups.findMemberById,
          { memberId: args.memberId }
        );
        const phone = member?.whatsappId || member?.phone;
        if (phone) {
          await ctx.runAction(
            internal.integrations.twilio.whatsapp.sendTextMessage,
            {
              to: phone,
              body: "I didn't quite catch that — could you pick one of the options above? 🙏",
            }
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
