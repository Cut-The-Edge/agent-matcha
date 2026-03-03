// @ts-nocheck
/**
 * Match Feedback Agent
 *
 * WhatsApp match feedback bot agent — handles the 8-category feedback flow
 * when a member receives a match suggestion.
 *
 * This agent wraps the core Agent Matcha with match-feedback-specific
 * system prompt additions and tools. It delegates to the flow engine
 * for the actual conversation tree and uses the AI bridge for:
 *   - Personalizing the initial match notification message
 *   - Interpreting free-text feedback responses
 *   - Generating follow-ups after delays
 *
 * The flow engine (convex/engine/) drives the decision tree.
 * This agent enhances it with AI-powered natural language capabilities.
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

import { matchaAgent } from "./matchaAgent";
import { TEMPERATURE } from "./config";

// ============================================================================
// Match Feedback System Prompt Supplement
// ============================================================================

const MATCH_FEEDBACK_CONTEXT = `
You are currently handling a match feedback conversation. The member has received
a new match suggestion and you're walking them through the feedback flow.

The feedback flow has these possible paths:
1. Interested -> Consent to share info -> Introduction / Group chat setup
2. Not interested -> Collect feedback categories (8 options) -> Optional free text -> Thank & close
3. Wants personal outreach ($150) -> Payment link -> Follow up
4. Needs time / reschedule -> Delay & follow up later

The 8 feedback categories for "not interested" are:
- Physical attraction
- Photos only (only saw photos, not enough info)
- Chemistry concerns
- Willingness to meet
- Age preference
- Location
- Career/income
- Something specific (free text)

Be especially sensitive when collecting "not interested" feedback. The member
may feel awkward explaining why. Make it easy and judgment-free.
`;

// ============================================================================
// handleMatchFeedbackMessage
// ============================================================================

/**
 * Process an incoming WhatsApp message in the context of a match feedback flow.
 *
 * This is called when a member replies during an active match feedback flow.
 * It uses the AI to interpret their response and maps it to the flow's
 * expected options, then advances the flow.
 */
export const handleMatchFeedbackMessage = internalAction({
  args: {
    flowInstanceId: v.id("flowInstances"),
    memberId: v.id("members"),
    matchId: v.id("matches"),
    messageText: v.string(),
    agentThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Get or create an agent thread for this conversation
    let threadId = args.agentThreadId;
    if (!threadId) {
      const threadResult = await ctx.runMutation(
        internal.agents.threads.getOrCreateThread,
        {
          memberId: args.memberId,
          matchId: args.matchId,
        },
      );
      threadId = threadResult.threadId;
    }

    // 2. Add the member's message to the agent thread for context
    await ctx.runMutation(internal.agents.threads.addMessageToThread, {
      threadId,
      role: "user",
      content: args.messageText,
      memberId: args.memberId,
    });

    // 3. Get the flow instance to understand what we're waiting for
    const instance = await ctx.runQuery(api.engine.queries.getFlowInstance, {
      flowInstanceId: args.flowInstanceId,
    });

    if (!instance) {
      console.error(`Flow instance ${args.flowInstanceId} not found`);
      return { handled: false, reason: "flow_instance_not_found" };
    }

    // 4. If the flow is waiting for a decision, use AI to classify the response
    const context = instance.context as any;
    if (context?.waitingForInput && context?.waitingNodeId) {
      // Get the flow definition to find the expected options
      const flowDef = await ctx.runQuery(api.engine.queries.getFlowDefinition, {
        flowDefinitionId: instance.flowDefinitionId,
      });

      if (flowDef) {
        const waitingNode = flowDef.nodes.find(
          (n: any) => n.nodeId === context.waitingNodeId,
        );

        if (waitingNode?.config?.options) {
          // Use AI to classify the response
          const classificationResult = await ctx.runAction(
            internal.agents.flowBridge.interpretResponse,
            {
              memberResponse: args.messageText,
              expectedOptions: waitingNode.config.options.map((opt: any) => ({
                value: opt.value,
                label: opt.label,
              })),
              questionContext: waitingNode.config.question,
              memberName: context.metadata?.memberName,
              threadId,
            },
          );

          if (
            classificationResult.classification &&
            classificationResult.classification !== "unclear" &&
            classificationResult.confidence !== "none"
          ) {
            // Advance the flow with the classified response
            return {
              handled: true,
              classification: classificationResult.classification,
              confidence: classificationResult.confidence,
              reasoning: classificationResult.reasoning,
              threadId,
            };
          }
        }
      }
    }

    // 5. If we couldn't classify, return unclear for the flow engine to handle
    return {
      handled: false,
      reason: "could_not_classify",
      threadId,
    };
  },
});

// ============================================================================
// generateMatchNotification
// ============================================================================

/**
 * Generate a personalized match notification message for a member.
 * Used when the flow engine starts a new match feedback flow.
 */
export const generateMatchNotification = internalAction({
  args: {
    memberId: v.id("members"),
    matchId: v.id("matches"),
    template: v.string(),
    agentThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up member and match details
    const member = await ctx.runQuery(api.members.queries.get as any, {
      memberId: args.memberId,
    }).catch(() => null);

    const memberName = member
      ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
      : "there";

    // Personalize using the flow bridge
    const result = await ctx.runAction(
      internal.agents.flowBridge.personalizeMessage,
      {
        template: args.template,
        memberContext: {
          memberId: args.memberId as string,
          memberName,
          tier: member?.tier,
        },
        matchContext: {
          matchId: args.matchId as string,
        },
        threadId: args.agentThreadId,
      },
    );

    return result;
  },
});
