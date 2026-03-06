// @ts-nocheck
/**
 * Flow Engine — Interpreter
 *
 * The core flow interpreter that drives conversation flow execution.
 * Given a flow instance, it evaluates the current node, determines
 * the next transition, and delegates execution to the appropriate handler.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { NODE_TYPES, INSTANCE_STATUS, EXECUTION_ACTIONS } from "./types";
import type {
  FlowNode,
  FlowEdge,
  FlowContext,
  TransitionResult,
  ActionNodeConfig,
  DecisionNodeConfig,
  ConditionNodeConfig,
  DelayNodeConfig,
  FeedbackCollectNodeConfig,
} from "./types";

// ============================================================================
// advanceFlow — Main entry point for advancing a flow instance
// ============================================================================

/**
 * Advance a flow instance to its next state.
 * Called when:
 * - A flow is first started (from the start node)
 * - A member sends a response (decision/feedback)
 * - A delay timer expires
 * - A condition is evaluated
 */
export const advanceFlow = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    input: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    if (
      instance.status !== INSTANCE_STATUS.ACTIVE
    ) {
      // Flow already completed/expired — stale advanceFlow call, safe to ignore
      console.log(
        `advanceFlow: instance ${args.flowInstanceId} already ${instance.status}, skipping`
      );
      return;
    }

    const flowDef = await ctx.db.get(instance.flowDefinitionId);
    if (!flowDef) {
      throw new Error(
        `Flow definition ${instance.flowDefinitionId} not found`
      );
    }

    const currentNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === instance.currentNodeId
    );
    if (!currentNode) {
      throw new Error(
        `Node ${instance.currentNodeId} not found in flow definition`
      );
    }

    const context: FlowContext = instance.context as FlowContext;
    const inputData = args.input ? args.input : undefined;

    // If the flow is waiting for external input (e.g., Stripe payment webhook)
    // and no input was provided, don't advance — stay paused.
    if (context.waitingForInput && !inputData) {
      console.log(
        `[interpreter] Flow ${args.flowInstanceId} is waiting for input at node ${instance.currentNodeId}, skipping advance`
      );
      return;
    }

    // Evaluate the current node and get the transition result
    const result = evaluateNode(
      currentNode,
      flowDef.edges,
      context,
      inputData
    );

    if (!result.success) {
      // Mark instance as error
      await ctx.db.patch(args.flowInstanceId, {
        status: INSTANCE_STATUS.ERROR,
        error: result.error || "Unknown evaluation error",
        lastTransitionAt: Date.now(),
        context: result.updatedContext,
      });

      // Log the error
      await ctx.db.insert("flowExecutionLogs", {
        instanceId: args.flowInstanceId,
        nodeId: currentNode.nodeId,
        nodeType: currentNode.type,
        action: EXECUTION_ACTIONS.ERROR,
        input: inputData ? inputData : undefined,
        output: JSON.stringify({ error: result.error }),
        timestamp: Date.now(),
      });
      return;
    }

    // If the node requires waiting (decision, feedback_collect), update context and wait
    if (result.shouldWait && !result.nextNodeId) {
      await ctx.db.patch(args.flowInstanceId, {
        context: result.updatedContext,
        lastTransitionAt: Date.now(),
      });

      await ctx.db.insert("flowExecutionLogs", {
        instanceId: args.flowInstanceId,
        nodeId: currentNode.nodeId,
        nodeType: currentNode.type,
        action: EXECUTION_ACTIONS.EXECUTED,
        input: inputData ? inputData : undefined,
        output: JSON.stringify({ waitingForInput: true }),
        timestamp: Date.now(),
      });
      return;
    }

    // Process the transition to the next node
    if (result.nextNodeId) {
      await ctx.runMutation(internal.engine.transitions.processTransition, {
        flowInstanceId: args.flowInstanceId,
        fromNodeId: currentNode.nodeId,
        toNodeId: result.nextNodeId,
        edgeId: result.edgeId || "",
        context: result.updatedContext,
        input: inputData,
      });

      // Look up the next node to see if we should auto-advance
      const nextNode = flowDef.nodes.find(
        (n: FlowNode) => n.nodeId === result.nextNodeId
      );

      if (nextNode) {
        // Auto-advance through non-waiting nodes
        const autoAdvanceTypes = [
          NODE_TYPES.START,
          NODE_TYPES.MESSAGE,
          NODE_TYPES.ACTION,
          NODE_TYPES.CONDITION,
          NODE_TYPES.END,
        ];

        if (autoAdvanceTypes.includes(nextNode.type as any)) {
          // Don't auto-advance into blocking action nodes — they wait for
          // external input (e.g., Stripe webhook) before the flow should proceed.
          const isBlocking =
            nextNode.type === NODE_TYPES.ACTION &&
            isBlockingAction(
              (nextNode.config as ActionNodeConfig)?.actionType
            );

          if (!isBlocking) {
            // Schedule the next advance immediately
            await ctx.scheduler.runAfter(
              0,
              internal.engine.interpreter.advanceFlow,
              {
                flowInstanceId: args.flowInstanceId,
                input: undefined,
              }
            );
          }
        }

        // For delay nodes, schedule after the delay duration
        if (nextNode.type === NODE_TYPES.DELAY) {
          const delayConfig = nextNode.config as DelayNodeConfig;
          const delayMs = convertToMs(
            delayConfig.duration,
            delayConfig.unit
          );

          await ctx.scheduler.runAfter(
            delayMs,
            internal.engine.transitions.handleTimeout,
            {
              flowInstanceId: args.flowInstanceId,
              nodeId: nextNode.nodeId,
            }
          );

          // If there's a reminder, schedule that too
          if (delayConfig.reminderAt && delayConfig.reminderTemplate) {
            const reminderMs = convertToMs(
              delayConfig.reminderAt,
              delayConfig.unit
            );
            if (reminderMs < delayMs) {
              await ctx.scheduler.runAfter(
                reminderMs,
                internal.engine.executor.executeReminderMessage,
                {
                  flowInstanceId: args.flowInstanceId,
                  nodeId: nextNode.nodeId,
                  template: delayConfig.reminderTemplate,
                }
              );
            }
          }
        }
      }
    }
  },
});

// ============================================================================
// evaluateNode — Determines behavior for current node type
// ============================================================================

function evaluateNode(
  node: FlowNode,
  edges: FlowEdge[],
  context: FlowContext,
  input?: string
): TransitionResult {
  const nodeEdges = edges.filter((e: FlowEdge) => e.source === node.nodeId);

  switch (node.type) {
    case NODE_TYPES.START: {
      // Start nodes always advance to the next node
      const nextEdge = nodeEdges[0];
      if (!nextEdge) {
        return {
          success: false,
          nextNodeId: null,
          updatedContext: context,
          error: "Start node has no outgoing edge",
          shouldWait: false,
        };
      }
      return {
        success: true,
        nextNodeId: nextEdge.target,
        edgeId: nextEdge.edgeId,
        updatedContext: context,
        shouldWait: false,
      };
    }

    case NODE_TYPES.MESSAGE: {
      // Message nodes send a message then advance
      const nextEdge = nodeEdges[0];
      if (!nextEdge) {
        return {
          success: false,
          nextNodeId: null,
          updatedContext: context,
          error: "Message node has no outgoing edge",
          shouldWait: false,
        };
      }
      return {
        success: true,
        nextNodeId: nextEdge.target,
        edgeId: nextEdge.edgeId,
        updatedContext: {
          ...context,
          timestamps: {
            ...context.timestamps,
            [`message_sent_${node.nodeId}`]: Date.now(),
          },
        },
        shouldWait: false,
      };
    }

    case NODE_TYPES.DECISION: {
      const config = node.config as DecisionNodeConfig;

      // If we don't have input yet, wait for member response
      if (!input) {
        return {
          success: true,
          nextNodeId: null,
          updatedContext: {
            ...context,
            waitingForInput: true,
            waitingNodeId: node.nodeId,
          },
          shouldWait: true,
        };
      }

      // We have input — find the matching option/edge
      const result = resolveNextNode(node, nodeEdges, context, input);
      return result;
    }

    case NODE_TYPES.FEEDBACK_COLLECT: {
      const config = node.config as FeedbackCollectNodeConfig;

      // If we don't have input yet, wait for feedback
      if (!input) {
        return {
          success: true,
          nextNodeId: null,
          updatedContext: {
            ...context,
            waitingForInput: true,
            waitingNodeId: node.nodeId,
          },
          shouldWait: true,
        };
      }

      // Parse the feedback input
      let feedbackData: any;
      try {
        feedbackData = JSON.parse(input);
      } catch {
        feedbackData = { freeText: input };
      }

      const updatedContext: FlowContext = {
        ...context,
        waitingForInput: false,
        waitingNodeId: undefined,
        feedbackCategories: feedbackData.categories || context.feedbackCategories || [],
        feedbackFreeText: feedbackData.freeText || context.feedbackFreeText,
        responses: {
          ...context.responses,
          [node.nodeId]: feedbackData,
        },
      };

      // Feedback collect always has one outgoing edge
      const nextEdge = nodeEdges[0];
      if (!nextEdge) {
        return {
          success: false,
          nextNodeId: null,
          updatedContext,
          error: "Feedback collect node has no outgoing edge",
          shouldWait: false,
        };
      }

      return {
        success: true,
        nextNodeId: nextEdge.target,
        edgeId: nextEdge.edgeId,
        updatedContext,
        shouldWait: false,
      };
    }

    case NODE_TYPES.ACTION: {
      // Action nodes execute and advance.
      // Clear waitingForInput so blocking actions (e.g., create_stripe_link)
      // don't leave the flag set after the webhook resumes the flow.
      const nextEdge = nodeEdges[0];
      if (!nextEdge) {
        // Action nodes at the end of a branch may not have outgoing edges
        return {
          success: true,
          nextNodeId: null,
          updatedContext: context,
          shouldWait: false,
        };
      }
      return {
        success: true,
        nextNodeId: nextEdge.target,
        edgeId: nextEdge.edgeId,
        updatedContext: {
          ...context,
          waitingForInput: false,
          waitingNodeId: undefined,
          timestamps: {
            ...context.timestamps,
            [`action_executed_${node.nodeId}`]: Date.now(),
          },
        },
        shouldWait: false,
      };
    }

    case NODE_TYPES.DELAY: {
      // Delay nodes are handled via scheduler — they just wait
      // When timeout fires, it will advance the flow
      const nextEdge = nodeEdges[0];
      return {
        success: true,
        nextNodeId: null,
        updatedContext: {
          ...context,
          waitingForInput: false,
          timestamps: {
            ...context.timestamps,
            [`delay_started_${node.nodeId}`]: Date.now(),
          },
        },
        shouldWait: true,
      };
    }

    case NODE_TYPES.CONDITION: {
      const config = node.config as ConditionNodeConfig;
      const conditionResult = evaluateCondition(config.expression, context);

      const targetEdgeId = conditionResult
        ? config.trueEdgeId
        : config.falseEdgeId;
      const targetEdge = edges.find(
        (e: FlowEdge) => e.edgeId === targetEdgeId
      );

      if (!targetEdge) {
        return {
          success: false,
          nextNodeId: null,
          updatedContext: context,
          error: `Condition edge ${targetEdgeId} not found`,
          shouldWait: false,
        };
      }

      return {
        success: true,
        nextNodeId: targetEdge.target,
        edgeId: targetEdge.edgeId,
        updatedContext: {
          ...context,
          responses: {
            ...context.responses,
            [node.nodeId]: { conditionResult, expression: config.expression },
          },
        },
        shouldWait: false,
      };
    }

    case NODE_TYPES.END: {
      // End nodes don't transition anywhere
      return {
        success: true,
        nextNodeId: null,
        updatedContext: context,
        shouldWait: false,
      };
    }

    default:
      return {
        success: false,
        nextNodeId: null,
        updatedContext: context,
        error: `Unknown node type: ${node.type}`,
        shouldWait: false,
      };
  }
}

// ============================================================================
// resolveNextNode — Find the correct outgoing edge based on input
// ============================================================================

function resolveNextNode(
  node: FlowNode,
  edges: FlowEdge[],
  context: FlowContext,
  input: string
): TransitionResult {
  const config = node.config as DecisionNodeConfig;

  // Try to match input to an option using progressive fuzzy matching
  const normalizedInput = input.toLowerCase().trim();

  // Check for numbered reply first: "1", "2", "3", etc.
  const num = parseInt(normalizedInput, 10);
  let matchedOption;
  if (
    !isNaN(num) &&
    num >= 1 &&
    num <= config.options.length &&
    String(num) === normalizedInput
  ) {
    matchedOption = config.options[num - 1];
  }

  // If no numbered match, try exact value/label match
  if (!matchedOption) {
    matchedOption = config.options.find(
      (opt) =>
        opt.value.toLowerCase() === normalizedInput ||
        opt.label.toLowerCase() === normalizedInput
    );
  }

  // Normalized match: strip punctuation, replace underscores/hyphens with spaces
  // (safety net — LLM resolution in handleMemberResponse handles complex cases)
  if (!matchedOption) {
    const cleanInput = normalize(normalizedInput);
    matchedOption = config.options.find((opt) => {
      const cleanValue = normalize(opt.value);
      const cleanLabel = normalize(opt.label);
      return cleanValue === cleanInput || cleanLabel === cleanInput;
    });
  }

  if (matchedOption) {
    const targetEdge = edges.find(
      (e: FlowEdge) => e.edgeId === matchedOption.edgeId
    );

    if (!targetEdge) {
      return {
        success: false,
        nextNodeId: null,
        updatedContext: context,
        error: `Edge ${matchedOption.edgeId} not found for option ${matchedOption.value}`,
        shouldWait: false,
      };
    }

    // Accumulate feedback categories for "why not" type decisions
    // so looping back doesn't lose previous selections
    const existingCategories = context.feedbackCategories || [];
    const isMainDecision = node.nodeId === "decision_response" || node.nodeId === "decision_more_reasons";
    const updatedCategories = isMainDecision
      ? existingCategories
      : existingCategories.includes(matchedOption.value)
        ? existingCategories
        : [...existingCategories, matchedOption.value];

    // For responses, append to array if this node was already visited (loop)
    const existingResponse = context.responses[node.nodeId];
    const responseEntry = {
      selectedOption: matchedOption.value,
      selectedLabel: matchedOption.label,
      rawInput: input,
    };
    const updatedNodeResponse = existingResponse
      ? Array.isArray(existingResponse)
        ? [...existingResponse, responseEntry]
        : [existingResponse, responseEntry]
      : responseEntry;

    return {
      success: true,
      nextNodeId: targetEdge.target,
      edgeId: targetEdge.edgeId,
      updatedContext: {
        ...context,
        waitingForInput: false,
        waitingNodeId: undefined,
        memberDecision: matchedOption.value,
        feedbackCategories: updatedCategories,
        responses: {
          ...context.responses,
          [node.nodeId]: updatedNodeResponse,
        },
      },
      shouldWait: false,
    };
  }

  // If no exact match, check for fuzzy/partial matches via edge labels
  const matchedEdge = edges.find(
    (e: FlowEdge) =>
      e.label && e.label.toLowerCase().includes(normalizedInput)
  );

  if (matchedEdge) {
    return {
      success: true,
      nextNodeId: matchedEdge.target,
      edgeId: matchedEdge.edgeId,
      updatedContext: {
        ...context,
        waitingForInput: false,
        waitingNodeId: undefined,
        memberDecision: normalizedInput,
        responses: {
          ...context.responses,
          [node.nodeId]: { rawInput: input, matchedByLabel: true },
        },
      },
      shouldWait: false,
    };
  }

  // No match found — if there's a timeout edge, use that as fallback
  if (config.timeoutEdgeId) {
    const timeoutEdge = edges.find(
      (e: FlowEdge) => e.edgeId === config.timeoutEdgeId
    );
    if (timeoutEdge) {
      return {
        success: true,
        nextNodeId: timeoutEdge.target,
        edgeId: timeoutEdge.edgeId,
        updatedContext: {
          ...context,
          waitingForInput: false,
          waitingNodeId: undefined,
          responses: {
            ...context.responses,
            [node.nodeId]: { rawInput: input, fallbackToTimeout: true },
          },
        },
        shouldWait: false,
      };
    }
  }

  // Truly no match — keep waiting
  return {
    success: true,
    nextNodeId: null,
    updatedContext: {
      ...context,
      responses: {
        ...context.responses,
        [`${node.nodeId}_unmatched`]: input,
      },
    },
    error: `No matching option for input: ${input}`,
    shouldWait: true,
  };
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Evaluate a simple condition expression against the flow context.
 * Supports basic expressions like:
 * - "rejectionCount >= 3"
 * - "paymentReceived == true"
 * - "consentGiven == true"
 */
function evaluateCondition(expression: string, context: FlowContext): boolean {
  try {
    // Parse simple expressions: "field operator value"
    const match = expression.match(
      /^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/
    );
    if (!match) return false;

    const [, field, operator, rawValue] = match;

    // Resolve the field value from context
    let fieldValue: any;
    if (field in context) {
      fieldValue = (context as any)[field];
    } else if (field in (context.metadata || {})) {
      fieldValue = context.metadata[field];
    } else if (field in (context.responses || {})) {
      fieldValue = context.responses[field];
    } else {
      fieldValue = undefined;
    }

    // Parse the comparison value
    let compareValue: any = rawValue.trim();
    if (compareValue === "true") compareValue = true;
    else if (compareValue === "false") compareValue = false;
    else if (!isNaN(Number(compareValue))) compareValue = Number(compareValue);
    else compareValue = compareValue.replace(/['"]/g, "");

    // Coerce fieldValue to number if compareValue is number
    if (typeof compareValue === "number" && typeof fieldValue !== "number") {
      fieldValue = Number(fieldValue) || 0;
    }

    switch (operator) {
      case ">=":
        return fieldValue >= compareValue;
      case "<=":
        return fieldValue <= compareValue;
      case "==":
        return fieldValue == compareValue;
      case "!=":
        return fieldValue != compareValue;
      case ">":
        return fieldValue > compareValue;
      case "<":
        return fieldValue < compareValue;
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Normalize text for fuzzy option matching.
 * Strips punctuation, replaces underscores/hyphens with spaces,
 * collapses whitespace, and lowercases.
 *
 * "I'm NOT_interested!!" → "im not interested"
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_-]/g, " ")          // underscores/hyphens → spaces
    .replace(/[^a-z0-9\s]/g, "")    // strip punctuation
    .replace(/\s+/g, " ")           // collapse whitespace
    .trim();
}

/**
 * Check if an action type is "blocking" — meaning the flow should pause
 * at this node and wait for external input (e.g., a webhook) before advancing.
 */
function isBlockingAction(actionType: string | undefined): boolean {
  const blockingTypes = ["create_stripe_link"];
  return !!actionType && blockingTypes.includes(actionType);
}

/**
 * Convert a duration + unit into milliseconds.
 */
function convertToMs(
  duration: number,
  unit: "minutes" | "hours" | "days"
): number {
  switch (unit) {
    case "minutes":
      return duration * 60 * 1000;
    case "hours":
      return duration * 60 * 60 * 1000;
    case "days":
      return duration * 24 * 60 * 60 * 1000;
    default:
      return duration * 1000;
  }
}
