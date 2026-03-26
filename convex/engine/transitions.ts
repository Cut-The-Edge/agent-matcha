// @ts-nocheck
/**
 * Flow Engine — Transitions
 *
 * Handles moving flow instances between nodes, logging execution,
 * processing member responses, and handling timeouts.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import {
  NODE_TYPES,
  INSTANCE_STATUS,
  EXECUTION_ACTIONS,
} from "./types";
import type {
  FlowNode,
  FlowEdge,
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

    // ── Auto-skip: AI-extracted feedback makes downstream nodes redundant ──
    // When the AI conversational fallback already collected rich feedback from
    // the member (stored in context.metadata.aiExtractedFeedback), we auto-skip
    // the mechanical follow-up nodes so the member doesn't get re-asked.
    const ctx_context = args.context as FlowContext;
    const aiExtracted = ctx_context.metadata?.aiExtractedFeedback as any;

    if (toNode && aiExtracted && !aiExtracted.needsFollowUp) {
      // --- Auto-skip DECISION nodes in the feedback pipeline ---
      // e.g., "decision_why_not" (asks "what didn't feel right?" — AI already knows)
      //       "decision_more_reasons" (asks "anything else?" — AI already captured all)
      if (toNode.type === NODE_TYPES.DECISION) {
        const autoSkipResult = getAutoSkipDecision(toNode, flowDef.edges, ctx_context, aiExtracted);
        if (autoSkipResult) {
          const updatedContext: FlowContext = {
            ...ctx_context,
            waitingForInput: false,
            waitingNodeId: undefined,
            memberDecision: autoSkipResult.optionValue,
            responses: {
              ...ctx_context.responses,
              [toNode.nodeId]: {
                selectedOption: autoSkipResult.optionValue,
                selectedLabel: autoSkipResult.optionLabel,
                rawInput: `[auto-resolved from AI conversation: ${aiExtracted.freeText?.slice(0, 100)}]`,
                autoSkipped: true,
              },
            },
          };

          await ctx.db.patch(args.flowInstanceId, {
            context: updatedContext,
            lastTransitionAt: Date.now(),
          });

          await ctx.db.insert("flowExecutionLogs", {
            instanceId: args.flowInstanceId,
            nodeId: toNode.nodeId,
            nodeType: NODE_TYPES.DECISION,
            action: "auto_skipped",
            output: JSON.stringify({
              reason: "ai_extracted_feedback",
              autoSelected: autoSkipResult.optionValue,
              categories: aiExtracted.categories,
            }),
            timestamp: Date.now(),
          });

          // Follow the selected edge
          await ctx.runMutation(internal.engine.transitions.processTransition, {
            flowInstanceId: args.flowInstanceId,
            fromNodeId: toNode.nodeId,
            toNodeId: autoSkipResult.targetNodeId,
            edgeId: autoSkipResult.edgeId,
            context: updatedContext,
            input: undefined,
          });

          // Auto-advance if needed
          const nextNode = flowDef.nodes.find(
            (n: FlowNode) => n.nodeId === autoSkipResult.targetNodeId,
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
          return;
        }
      }

      // --- Auto-skip FEEDBACK_COLLECT nodes ---
      // When AI already extracted the sub-category details for this feedback type
      if (toNode.type === NODE_TYPES.FEEDBACK_COLLECT) {
        const feedbackConfig = toNode.config as FeedbackCollectNodeConfig;
        const hasExtractedForType = aiExtracted.categories?.includes(feedbackConfig.feedbackType)
          || aiExtracted.subCategories?.[feedbackConfig.feedbackType];

        if (hasExtractedForType && feedbackConfig.feedbackType !== "other") {
          const subDetail = aiExtracted.subCategories?.[feedbackConfig.feedbackType] || "";
          const updatedContext: FlowContext = {
            ...ctx_context,
            waitingForInput: false,
            waitingNodeId: undefined,
            responses: {
              ...ctx_context.responses,
              [toNode.nodeId]: {
                skipped: true,
                reason: "ai_extracted_feedback",
                aiExtracted: subDetail,
                freeText: aiExtracted.freeText,
              },
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
            output: JSON.stringify({
              reason: "ai_extracted_feedback",
              feedbackType: feedbackConfig.feedbackType,
              aiExtracted: subDetail,
            }),
            timestamp: Date.now(),
          });

          // Follow the outgoing edge
          const outEdges = flowDef.edges.filter(
            (e: any) => e.source === toNode!.nodeId,
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

            const nextNode = flowDef.nodes.find(
              (n: FlowNode) => n.nodeId === outEdges[0].target,
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
    }

    // Legacy auto-skip: uncertainty at a DECISION → skip gut_feeling feedback
    if (toNode && toNode.type === NODE_TYPES.FEEDBACK_COLLECT) {
      const shouldSkip = shouldAutoSkipFeedback(ctx_context, args.fromNodeId, toNode);
      if (shouldSkip) {
        const updatedContext: FlowContext = {
          ...ctx_context,
          waitingForInput: false,
          waitingNodeId: undefined,
          responses: {
            ...ctx_context.responses,
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

        const outEdges = flowDef.edges.filter(
          (e: any) => e.source === toNode!.nodeId,
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

          const nextNode = flowDef.nodes.find(
            (n: FlowNode) => n.nodeId === outEdges[0].target,
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

    // Resolve best matchId from args or active flow instances
    const bestMatchId = args.matchId
      || instances.find((i) => i.matchId)?.matchId
      || undefined;

    // ALWAYS log the inbound message, even when no active flow or not waiting.
    // This ensures every member reply appears in the conversation thread.
    await ctx.db.insert("whatsappMessages", {
      matchId: bestMatchId,
      memberId: args.memberId,
      direction: "inbound",
      messageType: "text",
      content: args.response,
      twilioSid: args.twilioSid,
      status: "delivered",
      createdAt: Date.now(),
    });

    if (instances.length === 0) {
      // No active flow — check for special request keywords and escalate
      const specialRequestDetected = detectSpecialRequest(args.response);
      if (specialRequestDetected) {
        await ctx.scheduler.runAfter(
          0,
          internal.escalations.mutations.createEscalation,
          {
            memberId: args.memberId,
            issueType: specialRequestDetected.issueType as any,
            issueDescription: specialRequestDetected.description,
            memberMessage: args.response,
          },
        );

        // Also create action queue item for frustrated_member type
        if (specialRequestDetected.issueType === "frustrated_member") {
          await ctx.scheduler.runAfter(
            0,
            internal.actionQueue.mutations.createActionItem,
            {
              memberId: args.memberId,
              type: "frustrated_member" as const,
              priority: "urgent" as const,
              context: {
                memberMessage: args.response,
                description: specialRequestDetected.description,
              },
            },
          );
        }
      }
      return { handled: false, reason: "no_active_flow" };
    }

    // Find the instance that's waiting for input.
    // Prefer real (non-sandbox) instances over sandbox ones so that a
    // leftover sandbox flow doesn't steal replies meant for a real match.
    const waitingInstances = instances.filter((inst) => {
      const context = inst.context as FlowContext;
      return context.waitingForInput;
    });
    const waitingInstance =
      waitingInstances.find((inst) => !(inst.context as FlowContext).metadata?.sandbox) ??
      waitingInstances[0];

    if (!waitingInstance) {
      return { handled: false, reason: "not_waiting_for_input" };
    }

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

    // ── Special handling: member texted while waiting for Stripe payment ──
    if (context.metadata?.awaitingPayment) {
      await ctx.scheduler.runAfter(
        0,
        internal.engine.resolveInput.resolvePaymentWaitingInput,
        {
          flowInstanceId: waitingInstance._id,
          memberId: args.memberId,
          rawInput: args.response.trim(),
          matchId: waitingInstance.matchId || undefined,
        },
      );
      return {
        handled: true,
        flowInstanceId: waitingInstance._id,
        currentNodeId: waitingInstance.currentNodeId,
      };
    }

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

    // ── Check for special requests / frustrated language even during active flows ──
    // This runs alongside normal flow routing — the escalation is created
    // in parallel so Dani is notified, but the flow still proceeds.
    const specialRequest = detectSpecialRequest(args.response);
    if (specialRequest) {
      await ctx.scheduler.runAfter(
        0,
        internal.escalations.mutations.createEscalation,
        {
          memberId: args.memberId,
          matchId: bestMatchId,
          flowInstanceId: waitingInstance._id,
          issueType: specialRequest.issueType as any,
          issueDescription: specialRequest.description,
          memberMessage: args.response,
        },
      );

      // Also create action queue item for frustrated_member type
      if (specialRequest.issueType === "frustrated_member") {
        await ctx.scheduler.runAfter(
          0,
          internal.actionQueue.mutations.createActionItem,
          {
            memberId: args.memberId,
            matchId: bestMatchId,
            flowInstanceId: waitingInstance._id,
            type: "frustrated_member" as const,
            priority: "urgent" as const,
            context: {
              memberMessage: args.response,
              description: specialRequest.description,
            },
          },
        );
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
      // No quick match — let the LLM figure it out, with full flow context
      const question = (waitingNode?.config as any)?.question
        || (waitingNode?.config as any)?.prompt
        || "";

      // Build flow graph context so the LLM understands the pipeline
      let flowGraphContext = "";
      if (flowDef && context.waitingNodeId) {
        flowGraphContext = buildFlowGraphContext(
          flowDef.nodes,
          flowDef.edges,
          context.waitingNodeId,
          context,
        );
      }

      await ctx.scheduler.runAfter(
        0,
        internal.engine.resolveInput.resolveInputWithLLM,
        {
          flowInstanceId: waitingInstance._id,
          rawInput: args.response.trim(),
          options: optionsList,
          formatAsFeedbackJson: isFeedbackCollectNode || false,
          memberId: args.memberId,
          question,
          matchId: waitingInstance.matchId || undefined,
          flowGraphContext,
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
// rewindFlow — Move a flow instance back to a previous node
// ============================================================================

/**
 * Rewind a flow instance to a previously visited node. Used when the AI
 * conversational fallback detects the member changed their mind (e.g.,
 * "actually I am interested" while at a "why not" feedback node).
 *
 * Resets the instance to the target node, clears waiting state and extracted
 * feedback, logs the rewind, and re-executes the target node with new input.
 */
export const rewindFlow = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    targetNodeId: v.string(),
    input: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance || instance.status !== INSTANCE_STATUS.ACTIVE) return;

    const flowDef = await ctx.db.get(instance.flowDefinitionId);
    if (!flowDef) return;

    const targetNode = flowDef.nodes.find(
      (n: FlowNode) => n.nodeId === args.targetNodeId,
    );
    if (!targetNode) {
      console.error(`[rewindFlow] Target node ${args.targetNodeId} not found`);
      return;
    }

    const context = instance.context as FlowContext;
    const previousNodeId = instance.currentNodeId;

    // Cancel any pending scheduler job (timeout/nudge)
    if (instance.schedulerJobId) {
      try { await ctx.scheduler.cancel(instance.schedulerJobId); } catch {}
    }

    // Clear waiting state, extracted feedback (stale after rewind), and reset
    const updatedContext: FlowContext = {
      ...context,
      waitingForInput: false,
      waitingNodeId: undefined,
      metadata: {
        ...context.metadata,
        aiExtractedFeedback: undefined,
        rewindHistory: [
          ...((context.metadata?.rewindHistory as any[]) || []),
          {
            from: previousNodeId,
            to: args.targetNodeId,
            reason: args.reason || "member_changed_mind",
            at: Date.now(),
          },
        ],
      },
    };

    // Update instance to the target node
    await ctx.db.patch(args.flowInstanceId, {
      currentNodeId: args.targetNodeId,
      context: updatedContext,
      lastTransitionAt: Date.now(),
      schedulerJobId: undefined,
    });

    // Log the rewind
    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: previousNodeId,
      nodeType: "rewind",
      action: "rewound",
      input: args.input,
      output: JSON.stringify({
        from: previousNodeId,
        to: args.targetNodeId,
        reason: args.reason,
      }),
      timestamp: Date.now(),
    });

    console.log(
      `[rewindFlow] Rewound ${args.flowInstanceId}: ${previousNodeId} → ${args.targetNodeId} (${args.reason})`,
    );

    // Now advance the flow from the target node with the new input
    await ctx.scheduler.runAfter(0, internal.engine.interpreter.advanceFlow, {
      flowInstanceId: args.flowInstanceId,
      input: args.input,
    });
  },
});

// ============================================================================
// logOutboundMessage — Log an AI-generated outbound message to whatsappMessages
// ============================================================================

export const logOutboundMessage = internalMutation({
  args: {
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("whatsappMessages", {
      matchId: args.matchId,
      memberId: args.memberId,
      direction: "outbound",
      messageType: "text",
      content: args.content,
      status: "sent",
      createdAt: Date.now(),
    });
    return messageId;
  },
});

// ============================================================================
// getRecentMessages — Load recent WhatsApp messages for a member (no auth)
// ============================================================================

export const getRecentMessages = internalQuery({
  args: {
    memberId: v.id("members"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappMessages")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("desc")
      .take(args.limit ?? 10);
  },
});

// ============================================================================
// storeExtractedFeedback — Persist AI-extracted feedback into flow context
// ============================================================================

export const storeExtractedFeedback = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    extractedFeedback: v.object({
      categories: v.array(v.string()),
      subCategories: v.any(),
      freeText: v.string(),
      sentiment: v.string(),
      needsFollowUp: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return;

    const context = instance.context as FlowContext;
    const existing = context.metadata?.aiExtractedFeedback as any;

    // Merge with any previously extracted feedback (accumulates across turns)
    const mergedCategories = existing?.categories
      ? [...new Set([...existing.categories, ...args.extractedFeedback.categories])]
      : args.extractedFeedback.categories;

    const mergedSubCategories = {
      ...(existing?.subCategories || {}),
      ...args.extractedFeedback.subCategories,
    };

    const mergedFreeText = existing?.freeText
      ? `${existing.freeText}\n${args.extractedFeedback.freeText}`
      : args.extractedFeedback.freeText;

    const aiExtractedFeedback = {
      categories: mergedCategories,
      subCategories: mergedSubCategories,
      freeText: mergedFreeText,
      sentiment: args.extractedFeedback.sentiment,
      needsFollowUp: args.extractedFeedback.needsFollowUp,
      extractedAt: Date.now(),
    };

    await ctx.db.patch(args.flowInstanceId, {
      context: {
        ...context,
        feedbackCategories: [
          ...new Set([...(context.feedbackCategories || []), ...mergedCategories]),
        ],
        feedbackFreeText: mergedFreeText,
        metadata: {
          ...context.metadata,
          aiExtractedFeedback,
        },
      },
    });

    console.log(
      `[storeExtractedFeedback] Stored feedback for ${args.flowInstanceId}: ` +
      `categories=${mergedCategories.join(",")}, sentiment=${args.extractedFeedback.sentiment}`,
    );
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Build a human-readable description of the flow graph around the current node.
 * Includes the current node, its options, what each option leads to (1-2 levels),
 * and the previous node. This gives the LLM enough context to make routing decisions.
 */
export function buildFlowGraphContext(
  nodes: FlowNode[],
  edges: FlowEdge[],
  currentNodeId: string,
  context: FlowContext,
): string {
  const currentNode = nodes.find((n) => n.nodeId === currentNodeId);
  if (!currentNode) return "";

  const lines: string[] = [];

  // Previous node (where we came from)
  const incomingEdges = edges.filter((e) => e.target === currentNodeId);
  for (const edge of incomingEdges) {
    const prevNode = nodes.find((n) => n.nodeId === edge.source);
    if (prevNode) {
      lines.push(`Previous node: [${prevNode.type}] "${prevNode.label}"`);
      if (prevNode.type === "message") {
        const config = prevNode.config as MessageNodeConfig;
        lines.push(`  Message sent: "${config.template}"`);
      }
    }
  }

  // Current node
  lines.push(`\nCurrent node: [${currentNode.type}] "${currentNode.label}"`);

  // For decision nodes, describe each option and where it leads
  if (currentNode.type === "decision") {
    const config = currentNode.config as DecisionNodeConfig;
    lines.push(`Question asked: "${config.question}"`);
    lines.push(`Options and their downstream paths:`);

    for (const opt of config.options) {
      const edge = edges.find((e) => e.edgeId === opt.edgeId);
      if (!edge) {
        lines.push(`  - "${opt.label}" (value: ${opt.value}) → [unknown next step]`);
        continue;
      }
      const nextNode = nodes.find((n) => n.nodeId === edge.target);
      if (!nextNode) continue;

      let downstream = describeNode(nextNode);

      // Look one more level deep
      const nextEdges = edges.filter((e) => e.source === nextNode.nodeId);
      if (nextEdges.length > 0) {
        const deepNodes = nextEdges
          .map((e) => nodes.find((n) => n.nodeId === e.target))
          .filter(Boolean)
          .map((n) => describeNode(n!));
        if (deepNodes.length > 0) {
          downstream += ` → then: ${deepNodes.join(" / ")}`;
        }
      }

      lines.push(`  - "${opt.label}" (value: ${opt.value}) → ${downstream}`);
    }

    if (config.timeoutEdgeId) {
      const timeoutEdge = edges.find((e) => e.edgeId === config.timeoutEdgeId);
      if (timeoutEdge) {
        const timeoutNode = nodes.find((n) => n.nodeId === timeoutEdge.target);
        if (timeoutNode) {
          lines.push(`  - [timeout] → ${describeNode(timeoutNode)}`);
        }
      }
    }
  }

  // For feedback_collect nodes, describe categories
  if (currentNode.type === "feedback_collect") {
    const config = currentNode.config as FeedbackCollectNodeConfig;
    if (config.prompt) lines.push(`Prompt: "${config.prompt}"`);
    lines.push(`Categories: ${config.categories.join(", ")}`);

    const outEdges = edges.filter((e) => e.source === currentNodeId);
    for (const edge of outEdges) {
      const nextNode = nodes.find((n) => n.nodeId === edge.target);
      if (nextNode) {
        lines.push(`After selection → ${describeNode(nextNode)}`);
      }
    }
  }

  // Rewind targets: show previous DECISION nodes the member already passed through.
  // The AI can rewind to these if the member changes their mind.
  const visitedNodeIds = Object.keys(context.responses || {});
  const rewindTargets = nodes.filter(
    (n) =>
      n.type === "decision" &&
      n.nodeId !== currentNodeId &&
      visitedNodeIds.includes(n.nodeId),
  );
  if (rewindTargets.length > 0) {
    lines.push(`\n=== You can GO BACK to these previous decisions ===`);
    for (const target of rewindTargets) {
      const config = target.config as DecisionNodeConfig;
      const optionLabels = config.options.map((o) => `"${o.label}" (value: ${o.value})`).join(", ");
      const prevResponse = context.responses[target.nodeId];
      const prevChoice = prevResponse?.selectedOption || prevResponse?.selectedLabel || "unknown";
      lines.push(
        `  - Node "${target.nodeId}": "${config.question?.slice(0, 60)}..." — member chose: ${prevChoice}`,
      );
      lines.push(`    Options: ${optionLabels}`);
    }
  }

  return lines.join("\n");
}

/**
 * Describe a node in a short, human-readable way for the LLM context.
 */
function describeNode(node: FlowNode): string {
  switch (node.type) {
    case "message": {
      const c = node.config as MessageNodeConfig;
      const preview = c.template.length > 80
        ? c.template.slice(0, 80) + "…"
        : c.template;
      return `[message] "${preview}"`;
    }
    case "decision": {
      const c = node.config as DecisionNodeConfig;
      return `[decision] "${c.question}"`;
    }
    case "feedback_collect": {
      const c = node.config as FeedbackCollectNodeConfig;
      return `[feedback] ${c.prompt || c.feedbackType || "collect feedback"}`;
    }
    case "action": {
      const c = node.config as ActionNodeConfig;
      return `[action] ${c.actionType}`;
    }
    case "end": {
      return `[end] flow complete`;
    }
    case "delay": {
      const c = node.config as DelayNodeConfig;
      return `[delay] ${c.duration} ${c.unit}`;
    }
    default:
      return `[${node.type}] "${node.label}"`;
  }
}

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

/**
 * Determine if a DECISION node can be auto-answered using AI-extracted feedback.
 *
 * Handles two key decision nodes in the feedback pipeline:
 * - "decision_why_not": auto-selects the first extracted category
 * - "decision_more_reasons": auto-answers "no" since AI already got everything
 *
 * Returns the auto-skip routing info, or null if the node shouldn't be skipped.
 */
function getAutoSkipDecision(
  node: FlowNode,
  edges: FlowEdge[],
  context: FlowContext,
  aiExtracted: any,
): { optionValue: string; optionLabel: string; edgeId: string; targetNodeId: string } | null {
  const config = node.config as DecisionNodeConfig;

  // "decision_why_not" — pick the first extracted category
  if (node.nodeId === "decision_why_not" || config.question?.includes("what didn't feel right")) {
    const firstCategory = aiExtracted.categories?.[0];
    if (firstCategory) {
      const matchedOption = config.options.find(
        (opt) => opt.value === firstCategory,
      );
      if (matchedOption) {
        const edge = edges.find((e: any) => e.edgeId === matchedOption.edgeId);
        if (edge) {
          return {
            optionValue: matchedOption.value,
            optionLabel: matchedOption.label,
            edgeId: edge.edgeId,
            targetNodeId: edge.target,
          };
        }
      }
    }
  }

  // "decision_more_reasons" — AI already collected everything, answer "no"
  if (node.nodeId === "decision_more_reasons" || config.question?.includes("anything else")) {
    const noOption = config.options.find(
      (opt) => opt.value === "more_reasons_no" || opt.label.toLowerCase() === "no",
    );
    if (noOption) {
      const edge = edges.find((e: any) => e.edgeId === noOption.edgeId);
      if (edge) {
        return {
          optionValue: noOption.value,
          optionLabel: noOption.label,
          edgeId: edge.edgeId,
          targetNodeId: edge.target,
        };
      }
    }
  }

  return null;
}

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
 * Read a flow instance by ID (internal query for use from actions).
 */
export const getFlowInstance = internalQuery({
  args: { flowInstanceId: v.id("flowInstances") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.flowInstanceId);
  },
});

/**
 * Cancel pending payments for a flow instance and clear the awaitingPayment flag.
 * Must be called before rewindFlow so the flag doesn't persist into future nodes.
 */
export const cancelPendingPayment = internalMutation({
  args: { flowInstanceId: v.id("flowInstances") },
  handler: async (ctx, args) => {
    // Cancel any pending payment records
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_flowInstance", (q) =>
        q.eq("flowInstanceId", args.flowInstanceId),
      )
      .collect();
    for (const payment of payments) {
      if (payment.status === "pending") {
        await ctx.db.patch(payment._id, {
          status: "cancelled",
        });
      }
    }

    // Clear the awaitingPayment flag so future nodes aren't intercepted
    const instance = await ctx.db.get(args.flowInstanceId);
    if (instance) {
      const context = instance.context as any;
      await ctx.db.patch(args.flowInstanceId, {
        context: {
          ...context,
          metadata: {
            ...context.metadata,
            awaitingPayment: false,
          },
        },
      });
    }
  },
});

// ============================================================================
// detectSpecialRequest — Keyword-based detection for escalation triggers
// ============================================================================

/**
 * Detect if a member's message contains special request keywords, frustrated
 * language, or upsell-related intent that should be escalated to Dani.
 *
 * Returns null if no escalation is needed.
 */
function detectSpecialRequest(
  message: string,
): { issueType: string; description: string } | null {
  const lower = message.toLowerCase();

  // ── Frustrated member patterns ──
  const frustratedPatterns = [
    "frustrated", "annoyed", "angry", "furious", "terrible",
    "horrible", "awful", "unsubscribe", "leave me alone",
    "stop messaging", "stop texting", "ridiculous", "pathetic",
    "scam", "waste of time", "waste of money", "cancel my",
    "want to cancel", "this is wrong", "i'm done",
  ];
  if (frustratedPatterns.some((kw) => lower.includes(kw))) {
    return {
      issueType: "frustrated_member",
      description: `Member appears frustrated or upset. Detected keywords in their message.`,
    };
  }

  // ── Special request patterns ──
  const specialRequestPatterns = [
    { pattern: "speak to", desc: "Wants to speak to someone" },
    { pattern: "talk to dani", desc: "Requesting to talk to Dani" },
    { pattern: "talk to a person", desc: "Requesting human contact" },
    { pattern: "talk to a human", desc: "Requesting human contact" },
    { pattern: "talk to someone", desc: "Requesting to talk to someone" },
    { pattern: "real person", desc: "Requesting human contact" },
    { pattern: "can you call me", desc: "Requesting a phone call" },
    { pattern: "call me", desc: "Requesting a phone call" },
    { pattern: "schedule a call", desc: "Requesting a scheduled call" },
    { pattern: "different match", desc: "Requesting a different match" },
    { pattern: "change my preferences", desc: "Wants to update preferences" },
    { pattern: "pause my account", desc: "Wants to pause membership" },
    { pattern: "refund", desc: "Requesting a refund" },
    { pattern: "complaint", desc: "Filing a complaint" },
    { pattern: "manager", desc: "Requesting to speak with a manager" },
    { pattern: "specific person", desc: "Requesting a specific match" },
    { pattern: "particular person", desc: "Requesting a specific match" },
    { pattern: "i know someone", desc: "Referring a specific person" },
  ];

  for (const { pattern, desc } of specialRequestPatterns) {
    if (lower.includes(pattern)) {
      return {
        issueType: "special_request",
        description: desc,
      };
    }
  }

  return null;
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
          templateKey: config.templateKey,
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
          templateKey: config.templateKey,
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
