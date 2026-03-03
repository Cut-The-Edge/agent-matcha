// @ts-nocheck
/**
 * Flow Engine — Transitions
 *
 * Handles moving flow instances between nodes, logging execution,
 * processing member responses, and handling timeouts.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  NODE_TYPES,
  INSTANCE_STATUS,
  EXECUTION_ACTIONS,
} from "./types";
import type {
  FlowNode,
  FlowContext,
  MessageNodeConfig,
  DecisionNodeConfig,
  ActionNodeConfig,
  DelayNodeConfig,
  FeedbackCollectNodeConfig,
  EndNodeConfig,
  ConditionNodeConfig,
} from "./types";

// ============================================================================
// processTransition — Move instance from one node to the next
// ============================================================================

export const processTransition = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    fromNodeId: v.string(),
    toNodeId: v.string(),
    edgeId: v.string(),
    context: v.any(),
    input: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const flowDef = await ctx.db.get(instance.flowDefinitionId);
    if (!flowDef) {
      throw new Error(
        `Flow definition ${instance.flowDefinitionId} not found`
      );
    }

    // Log exit from current node
    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.fromNodeId,
      nodeType: getNodeType(flowDef.nodes, args.fromNodeId),
      action: EXECUTION_ACTIONS.EXITED,
      input: args.input || undefined,
      output: JSON.stringify({ nextNode: args.toNodeId, edge: args.edgeId }),
      timestamp: Date.now(),
    });

    // Update instance to new node
    await ctx.db.patch(args.flowInstanceId, {
      currentNodeId: args.toNodeId,
      context: args.context,
      lastTransitionAt: Date.now(),
    });

    // Log entry to new node
    const toNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === args.toNodeId
    );

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.toNodeId,
      nodeType: toNode ? toNode.type : "unknown",
      action: EXECUTION_ACTIONS.ENTERED,
      input: args.input || undefined,
      timestamp: Date.now(),
    });

    // Check if we should auto-skip this FEEDBACK_COLLECT node.
    // When a member expressed uncertainty at a DECISION (e.g., "I don't know" → gut_feeling),
    // asking a follow-up sub-category question feels robotic. Auto-skip instead.
    if (toNode && toNode.type === NODE_TYPES.FEEDBACK_COLLECT) {
      const shouldSkip = shouldAutoSkipFeedback(args.context as FlowContext, args.fromNodeId, toNode);
      if (shouldSkip) {
        // Store a "skipped" response in context and advance to the next node
        const feedbackConfig = toNode.config as FeedbackCollectNodeConfig;
        const updatedContext: FlowContext = {
          ...(args.context as FlowContext),
          waitingForInput: false,
          waitingNodeId: undefined,
          responses: {
            ...(args.context as FlowContext).responses,
            [toNode.nodeId]: { skipped: true, reason: "member_expressed_uncertainty" },
          },
        };

        await ctx.db.patch(args.flowInstanceId, {
          context: updatedContext,
          lastTransitionAt: Date.now(),
        });

        await ctx.db.insert("flowExecutionLogs", {
          instanceId: args.flowInstanceId,
          nodeId: toNode.nodeId,
          nodeType: NODE_TYPES.FEEDBACK_COLLECT,
          action: "auto_skipped",
          output: JSON.stringify({ reason: "member_expressed_uncertainty" }),
          timestamp: Date.now(),
        });

        // Find the single outgoing edge and advance through it
        const outEdges = flowDef.edges.filter(
          (e: any) => e.source === toNode!.nodeId
        );
        if (outEdges.length > 0) {
          await ctx.runMutation(internal.engine.transitions.processTransition, {
            flowInstanceId: args.flowInstanceId,
            fromNodeId: toNode.nodeId,
            toNodeId: outEdges[0].target,
            edgeId: outEdges[0].edgeId,
            context: updatedContext,
            input: undefined,
          });

          // Auto-advance if the next node is non-waiting
          const nextNode = flowDef.nodes.find(
            (n: FlowNode) => n.nodeId === outEdges[0].target
          );
          if (nextNode) {
            const autoTypes = [
              NODE_TYPES.START, NODE_TYPES.MESSAGE, NODE_TYPES.ACTION,
              NODE_TYPES.CONDITION, NODE_TYPES.END,
            ];
            if (autoTypes.includes(nextNode.type as any)) {
              await ctx.scheduler.runAfter(0, internal.engine.interpreter.advanceFlow, {
                flowInstanceId: args.flowInstanceId,
                input: undefined,
              });
            }
          }
        }
        return;
      }
    }

    // Execute the new node's side effects
    if (toNode) {
      await executeNodeSideEffects(
        ctx,
        args.flowInstanceId,
        toNode,
        args.context as FlowContext
      );
    }
  },
});

// ============================================================================
// handleMemberResponse — Internal mutation for incoming WhatsApp messages
// ============================================================================

export const handleMemberResponse = internalMutation({
  args: {
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    response: v.string(),
    twilioSid: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find the active flow instance for this member
    let instances;

    if (args.matchId) {
      instances = await ctx.db
        .query("flowInstances")
        .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
        .filter((q) => q.eq(q.field("status"), INSTANCE_STATUS.ACTIVE))
        .collect();
    }

    // If no match-specific instance, look by member
    if (!instances || instances.length === 0) {
      instances = await ctx.db
        .query("flowInstances")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .filter((q) => q.eq(q.field("status"), INSTANCE_STATUS.ACTIVE))
        .collect();
    }

    if (instances.length === 0) {
      return { handled: false, reason: "no_active_flow" };
    }

    // Find the instance that's waiting for input
    const waitingInstance = instances.find((inst) => {
      const context = inst.context as FlowContext;
      return context.waitingForInput;
    });

    if (!waitingInstance) {
      return { handled: false, reason: "not_waiting_for_input" };
    }

    // Log the inbound message
    await ctx.db.insert("whatsappMessages", {
      matchId: args.matchId || waitingInstance.matchId || undefined,
      memberId: args.memberId,
      direction: "inbound",
      messageType: "text",
      content: args.response,
      twilioSid: args.twilioSid,
      status: "delivered",
      createdAt: Date.now(),
    });

    // Cancel pending timeout if one exists
    if (waitingInstance.schedulerJobId) {
      try {
        await ctx.scheduler.cancel(waitingInstance.schedulerJobId);
      } catch {
        // Job may have already fired — safe to ignore
      }
      await ctx.db.patch(waitingInstance._id, {
        schedulerJobId: undefined,
      });
    }

    // Resolve member input against the waiting node's options.
    // Quick matching (numbered, exact, normalized) runs inline.
    // If no quick match at a DECISION or FEEDBACK_COLLECT node, schedule LLM.
    const context = waitingInstance.context as FlowContext;
    let resolvedInput: string | null = null;

    const flowDef = await ctx.db.get(waitingInstance.flowDefinitionId);
    const waitingNode = flowDef?.nodes.find(
      (n: FlowNode) => n.nodeId === context.waitingNodeId
    );

    const isDecisionNode =
      waitingNode?.type === NODE_TYPES.DECISION &&
      (waitingNode.config as DecisionNodeConfig)?.options;

    const isFeedbackCollectNode =
      waitingNode?.type === NODE_TYPES.FEEDBACK_COLLECT &&
      (waitingNode.config as FeedbackCollectNodeConfig)?.categories?.length > 0;

    // Build a unified options list from either DECISION options or FEEDBACK_COLLECT categories
    let optionsList: { value: string; label: string }[] = [];
    if (isDecisionNode) {
      const config = waitingNode!.config as DecisionNodeConfig;
      optionsList = config.options.map((o) => ({ value: o.value, label: o.label }));
    } else if (isFeedbackCollectNode) {
      const config = waitingNode!.config as FeedbackCollectNodeConfig;
      optionsList = config.categories.map((cat: string) => ({
        value: cat,
        label: cat,
      }));
    }

    if (optionsList.length > 0) {
      const trimmed = args.response.trim();
      const normalizedInput = trimmed.toLowerCase();

      // 1. Numbered reply: "1", "2", etc.
      const num = parseInt(trimmed, 10);
      if (
        !isNaN(num) &&
        num >= 1 &&
        num <= optionsList.length &&
        String(num) === trimmed
      ) {
        resolvedInput = optionsList[num - 1].value;
      }

      // 2. Exact value/label match
      if (!resolvedInput) {
        const exact = optionsList.find(
          (opt) =>
            opt.value.toLowerCase() === normalizedInput ||
            opt.label.toLowerCase() === normalizedInput
        );
        if (exact) resolvedInput = exact.value;
      }

      // 3. Normalized match (underscores/hyphens → spaces, strip punctuation)
      if (!resolvedInput) {
        const cleanInput = normalizeText(normalizedInput);
        const normalized = optionsList.find((opt) => {
          const cleanVal = normalizeText(opt.value);
          const cleanLbl = normalizeText(opt.label);
          return cleanVal === cleanInput || cleanLbl === cleanInput;
        });
        if (normalized) resolvedInput = normalized.value;
      }
    }

    if (resolvedInput && isFeedbackCollectNode) {
      // Quick match on feedback category — pass as structured JSON
      const matchedOpt = optionsList.find((o) => o.value === resolvedInput);
      await ctx.scheduler.runAfter(
        0,
        internal.engine.interpreter.advanceFlow,
        {
          flowInstanceId: waitingInstance._id,
          input: JSON.stringify({
            selectedOption: resolvedInput,
            selectedLabel: matchedOpt?.label || resolvedInput,
            rawInput: args.response.trim(),
          }),
        }
      );
    } else if (resolvedInput) {
      // Quick match on decision option — pass value directly
      await ctx.scheduler.runAfter(
        0,
        internal.engine.interpreter.advanceFlow,
        {
          flowInstanceId: waitingInstance._id,
          input: resolvedInput,
        }
      );
    } else if (isDecisionNode || isFeedbackCollectNode) {
      // No quick match — let the LLM figure it out
      await ctx.scheduler.runAfter(
        0,
        internal.engine.resolveInput.resolveInputWithLLM,
        {
          flowInstanceId: waitingInstance._id,
          rawInput: args.response.trim(),
          options: optionsList,
          formatAsFeedbackJson: isFeedbackCollectNode || false,
          memberId: args.memberId,
        }
      );
    } else {
      // No options to match against (plain text node) — pass raw input
      await ctx.scheduler.runAfter(
        0,
        internal.engine.interpreter.advanceFlow,
        {
          flowInstanceId: waitingInstance._id,
          input: args.response.trim(),
        }
      );
    }

    return {
      handled: true,
      flowInstanceId: waitingInstance._id,
      currentNodeId: waitingInstance.currentNodeId,
    };
  },
});

// ============================================================================
// handleTimeout — Called by scheduler when a delay expires
// ============================================================================

export const handleTimeout = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return;

    // Only process if instance is still active and on the expected node
    if (
      instance.status !== INSTANCE_STATUS.ACTIVE ||
      instance.currentNodeId !== args.nodeId
    ) {
      return;
    }

    const flowDef = await ctx.db.get(instance.flowDefinitionId);
    if (!flowDef) return;

    const currentNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === args.nodeId
    );
    if (!currentNode) return;

    // Find the outgoing edge from the delay node
    const edges = flowDef.edges.filter(
      (e: any) => e.source === args.nodeId
    );

    // Check if there's a timeout-specific edge
    const delayConfig = currentNode.config as DelayNodeConfig;
    let targetEdge;

    if (delayConfig.timeoutEdgeId) {
      targetEdge = flowDef.edges.find(
        (e: any) => e.edgeId === delayConfig.timeoutEdgeId
      );
    }

    // Fall back to the first outgoing edge
    if (!targetEdge && edges.length > 0) {
      targetEdge = edges[0];
    }

    if (!targetEdge) {
      // No edge to follow — mark as error
      await ctx.db.patch(args.flowInstanceId, {
        status: INSTANCE_STATUS.ERROR,
        error: `Delay node ${args.nodeId} has no outgoing edge after timeout`,
        lastTransitionAt: Date.now(),
      });
      return;
    }

    const context = instance.context as FlowContext;

    // Log timeout event
    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.DELAY,
      action: "timeout_fired",
      output: JSON.stringify({
        nextNode: targetEdge.target,
        edge: targetEdge.edgeId,
      }),
      timestamp: Date.now(),
    });

    // Process the transition
    await ctx.runMutation(internal.engine.transitions.processTransition, {
      flowInstanceId: args.flowInstanceId,
      fromNodeId: args.nodeId,
      toNodeId: targetEdge.target,
      edgeId: targetEdge.edgeId,
      context,
      input: undefined,
    });

    // Check the next node type to see if we need to auto-advance
    const nextNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === targetEdge.target
    );

    if (nextNode) {
      const autoAdvanceTypes = [
        NODE_TYPES.START,
        NODE_TYPES.MESSAGE,
        NODE_TYPES.ACTION,
        NODE_TYPES.CONDITION,
        NODE_TYPES.END,
      ];

      if (autoAdvanceTypes.includes(nextNode.type as any)) {
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
  },
});

// ============================================================================
// handleDecisionTimeout — Fired when a decision node timeout expires
// ============================================================================

export const handleDecisionTimeout = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return;

    // Only fire if instance is still active AND still on this node
    if (
      instance.status !== INSTANCE_STATUS.ACTIVE ||
      instance.currentNodeId !== args.nodeId
    ) {
      return;
    }

    const context = instance.context as FlowContext;
    // Only fire if still waiting for input on this node
    if (!context.waitingForInput || context.waitingNodeId !== args.nodeId) {
      return;
    }

    const flowDef = await ctx.db.get(instance.flowDefinitionId);
    if (!flowDef) return;

    const currentNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === args.nodeId
    );
    if (!currentNode) return;

    const config = currentNode.config as DecisionNodeConfig;

    // Find the timeout edge
    let targetEdge;
    if (config.timeoutEdgeId) {
      targetEdge = flowDef.edges.find(
        (e: any) => e.edgeId === config.timeoutEdgeId
      );
    }

    if (!targetEdge) {
      // No timeout edge configured — mark as error
      await ctx.db.patch(args.flowInstanceId, {
        status: INSTANCE_STATUS.ERROR,
        error: `Decision node ${args.nodeId} timed out but has no timeoutEdgeId`,
        lastTransitionAt: Date.now(),
        schedulerJobId: undefined,
      });
      return;
    }

    // Clear the scheduler job ID
    await ctx.db.patch(args.flowInstanceId, {
      schedulerJobId: undefined,
    });

    // Log timeout event
    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.DECISION,
      action: "timeout_fired",
      output: JSON.stringify({
        nextNode: targetEdge.target,
        edge: targetEdge.edgeId,
      }),
      timestamp: Date.now(),
    });

    // Clear waiting state and transition
    const updatedContext: FlowContext = {
      ...context,
      waitingForInput: false,
      waitingNodeId: undefined,
      responses: {
        ...context.responses,
        [args.nodeId]: { timedOut: true },
      },
    };

    // Process the transition
    await ctx.runMutation(internal.engine.transitions.processTransition, {
      flowInstanceId: args.flowInstanceId,
      fromNodeId: args.nodeId,
      toNodeId: targetEdge.target,
      edgeId: targetEdge.edgeId,
      context: updatedContext,
      input: undefined,
    });

    // Auto-advance if needed
    const nextNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === targetEdge.target
    );
    if (nextNode) {
      const autoAdvanceTypes = [
        NODE_TYPES.START,
        NODE_TYPES.MESSAGE,
        NODE_TYPES.ACTION,
        NODE_TYPES.CONDITION,
        NODE_TYPES.END,
      ];
      if (autoAdvanceTypes.includes(nextNode.type as any)) {
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
  },
});

// ============================================================================
// handleFeedbackCollectTimeout — Fired when a feedback_collect node timeout expires
// ============================================================================

export const handleFeedbackCollectTimeout = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return;

    // Only fire if instance is still active AND still on this node
    if (
      instance.status !== INSTANCE_STATUS.ACTIVE ||
      instance.currentNodeId !== args.nodeId
    ) {
      return;
    }

    const context = instance.context as FlowContext;
    // Only fire if still waiting for input on this node
    if (!context.waitingForInput || context.waitingNodeId !== args.nodeId) {
      return;
    }

    const flowDef = await ctx.db.get(instance.flowDefinitionId);
    if (!flowDef) return;

    const currentNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === args.nodeId
    );
    if (!currentNode) return;

    const config = currentNode.config as FeedbackCollectNodeConfig;

    // Cap nudges to prevent infinite spam if the member never responds
    const MAX_NUDGES = 3;
    const nudgeKey = `nudge_count_${args.nodeId}`;
    const nudgeCount = ((context.metadata?.[nudgeKey] as number) ?? 0);
    if (nudgeCount >= MAX_NUDGES) {
      await ctx.db.patch(args.flowInstanceId, {
        status: INSTANCE_STATUS.EXPIRED,
        schedulerJobId: undefined,
        lastTransitionAt: Date.now(),
      });
      await ctx.db.insert("flowExecutionLogs", {
        instanceId: args.flowInstanceId,
        nodeId: args.nodeId,
        nodeType: NODE_TYPES.FEEDBACK_COLLECT,
        action: "timeout_expired",
        output: JSON.stringify({ nudgeCount, maxReached: true }),
        timestamp: Date.now(),
      });
      return;
    }

    // Increment nudge count
    const updatedMetadata = { ...context.metadata, [nudgeKey]: nudgeCount + 1 };
    await ctx.db.patch(args.flowInstanceId, {
      context: { ...context, metadata: updatedMetadata },
    });

    // Send the nudge message inline (no separate nudge node needed)
    const nudgeTemplate =
      config.timeoutMessage ||
      "Hey {{memberFirstName}}, still here whenever you're ready to share!";

    // Resolve template variables
    let resolvedNudge = nudgeTemplate;
    const variablePattern = /\{\{(\w+)\}\}/g;
    resolvedNudge = resolvedNudge.replace(variablePattern, (match, key) => {
      if (key in (context.metadata || {})) {
        return String(context.metadata[key]);
      }
      if (key in context) {
        return String((context as any)[key]);
      }
      return match;
    });

    if (instance.memberId) {
      const member = await ctx.db.get(instance.memberId);
      const phone = member?.whatsappId || member?.phone || null;

      const messageId = await ctx.db.insert("whatsappMessages", {
        matchId: instance.matchId || undefined,
        memberId: instance.memberId,
        direction: "outbound",
        messageType: "text",
        content: resolvedNudge,
        status: "sent",
        createdAt: Date.now(),
      });

      if (phone) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.twilio.whatsapp.sendTextMessage,
          {
            to: phone,
            body: resolvedNudge,
            whatsappMessageId: messageId,
          }
        );
      }
    }

    // Clear the scheduler job ID
    await ctx.db.patch(args.flowInstanceId, {
      schedulerJobId: undefined,
    });

    // Log timeout event
    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.FEEDBACK_COLLECT,
      action: "timeout_fired",
      output: JSON.stringify({ nudgeMessage: resolvedNudge }),
      timestamp: Date.now(),
    });

    // Re-read instance to guard against race with handleMemberResponse
    const freshInstance = await ctx.db.get(args.flowInstanceId);
    if (
      !freshInstance ||
      freshInstance.status !== INSTANCE_STATUS.ACTIVE ||
      !(freshInstance.context as FlowContext).waitingForInput ||
      (freshInstance.context as FlowContext).waitingNodeId !== args.nodeId
    ) {
      return; // Member responded while we were sending the nudge
    }

    // Re-execute the same feedback collect node (re-sends the question + sets a new timeout)
    await ctx.scheduler.runAfter(
      0,
      internal.engine.executor.executeFeedbackCollectNode,
      {
        flowInstanceId: args.flowInstanceId,
        nodeId: args.nodeId,
        categories: config.categories,
        allowFreeText: config.allowFreeText,
        feedbackType: config.feedbackType,
        prompt: config.prompt,
        timeout: config.timeout,
        timeoutMessage: config.timeoutMessage,
      }
    );
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine if a FEEDBACK_COLLECT node should be auto-skipped.
 *
 * Detects when the member's previous response at a DECISION node expressed
 * uncertainty (e.g., "I don't know", "idk"). In these cases, asking a
 * sub-category follow-up feels robotic — the member already said they
 * can't explain it.
 *
 * Returns true if the feedback node should be skipped.
 */
function shouldAutoSkipFeedback(
  context: FlowContext,
  fromNodeId: string,
  toNode: FlowNode
): boolean {
  const feedbackConfig = toNode.config as FeedbackCollectNodeConfig;

  // Only auto-skip for the "gut_feeling" feedback type —
  // other categories (physical, bio, etc.) have meaningful sub-questions
  // even if the member's phrasing was vague
  if (feedbackConfig.feedbackType !== "gut_feeling") {
    return false;
  }

  // Check the raw input from the preceding decision node
  const prevResponse = context.responses?.[fromNodeId];
  if (!prevResponse) return false;

  // Get the raw input (handle both single response and array from loops)
  const lastResponse = Array.isArray(prevResponse)
    ? prevResponse[prevResponse.length - 1]
    : prevResponse;

  const rawInput = (lastResponse?.rawInput || "").toLowerCase();
  if (!rawInput) return false;

  // Uncertainty phrases that suggest "I have nothing more to say"
  const uncertaintyPatterns = [
    "don't know", "dont know", "dunno", "no idea",
    "idk", "i dk", "not sure", "unsure",
    "can't explain", "cant explain", "hard to say",
    "just because", "just felt", "no reason",
    "skip", "pass", "nothing specific",
    "לא יודע", "לא יודעת", // Hebrew: "I don't know" (m/f)
  ];

  return uncertaintyPatterns.some((pattern) => rawInput.includes(pattern));
}

/**
 * Normalize text for quick option matching.
 * Strips punctuation, replaces underscores/hyphens with spaces, lowercases.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Get the node type from the flow definition's node list.
 */
function getNodeType(nodes: FlowNode[], nodeId: string): string {
  const node = nodes.find((n: FlowNode) => n.nodeId === nodeId);
  return node ? node.type : "unknown";
}

/**
 * Execute side effects when entering a node.
 * This dispatches to the appropriate executor based on node type.
 */
async function executeNodeSideEffects(
  ctx: any,
  flowInstanceId: string,
  node: FlowNode,
  context: FlowContext
): Promise<void> {
  switch (node.type) {
    case NODE_TYPES.MESSAGE: {
      const config = node.config as MessageNodeConfig;
      await ctx.scheduler.runAfter(
        0,
        internal.engine.executor.executeMessageNode,
        {
          flowInstanceId,
          nodeId: node.nodeId,
          template: config.template,
          channel: config.channel || "whatsapp",
          mediaUrl: config.mediaUrl,
        }
      );
      break;
    }

    case NODE_TYPES.DECISION: {
      const config = node.config as DecisionNodeConfig;
      await ctx.scheduler.runAfter(
        0,
        internal.engine.executor.executeDecisionNode,
        {
          flowInstanceId,
          nodeId: node.nodeId,
          question: config.question,
          options: config.options,
          timeout: config.timeout,
          timeoutEdgeId: config.timeoutEdgeId,
        }
      );
      break;
    }

    case NODE_TYPES.FEEDBACK_COLLECT: {
      const config = node.config as FeedbackCollectNodeConfig;
      await ctx.scheduler.runAfter(
        0,
        internal.engine.executor.executeFeedbackCollectNode,
        {
          flowInstanceId,
          nodeId: node.nodeId,
          categories: config.categories,
          allowFreeText: config.allowFreeText,
          feedbackType: config.feedbackType,
          prompt: config.prompt,
          timeout: config.timeout,
          timeoutMessage: config.timeoutMessage,
        }
      );
      break;
    }

    case NODE_TYPES.ACTION: {
      const config = node.config as ActionNodeConfig;
      await ctx.scheduler.runAfter(
        0,
        internal.engine.executor.executeActionNode,
        {
          flowInstanceId,
          nodeId: node.nodeId,
          actionType: config.actionType,
          params: config.params,
        }
      );
      break;
    }

    case NODE_TYPES.DELAY: {
      const config = node.config as DelayNodeConfig;
      await ctx.scheduler.runAfter(
        0,
        internal.engine.executor.executeDelayNode,
        {
          flowInstanceId,
          nodeId: node.nodeId,
          duration: config.duration,
          unit: config.unit,
        }
      );
      break;
    }

    case NODE_TYPES.END: {
      const config = node.config as EndNodeConfig;
      await ctx.scheduler.runAfter(
        0,
        internal.engine.executor.executeEndNode,
        {
          flowInstanceId,
          nodeId: node.nodeId,
          endType: config.endType || "completed",
        }
      );
      break;
    }

    // CONDITION nodes don't have side effects — they're handled by the interpreter
    // START nodes also don't have side effects
    default:
      break;
  }
}
