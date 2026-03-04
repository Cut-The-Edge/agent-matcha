// @ts-nocheck
/**
 * Flow Engine — Node Executors
 *
 * One handler function per node type. These execute the side effects
 * of each node (send messages, create records, schedule delays, etc.).
 * After logging messages to whatsappMessages, each executor schedules
 * a Twilio send action for actual WhatsApp delivery.
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { NODE_TYPES, INSTANCE_STATUS, EXECUTION_ACTIONS } from "./types";
import type {
  MessageNodeConfig,
  DecisionNodeConfig,
  ActionNodeConfig,
  DelayNodeConfig,
  ConditionNodeConfig,
  FeedbackCollectNodeConfig,
  EndNodeConfig,
  FlowContext,
} from "./types";

/**
 * Look up a member's WhatsApp phone number.
 * Returns null if not found.
 */
async function getMemberPhone(ctx: any, memberId: string): Promise<string | null> {
  const member = await ctx.db.get(memberId);
  if (!member) return null;
  return member.whatsappId || member.phone || null;
}

// ============================================================================
// executeMessageNode — Log outbound message to whatsappMessages
// ============================================================================

export const executeMessageNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    template: v.string(),
    channel: v.string(),
    mediaUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    // Resolve template variables from context
    const context = instance.context as FlowContext;
    const resolvedMessage = resolveTemplate(args.template, context);

    // Log the outbound message to whatsappMessages
    let messageId: string | undefined;
    if (instance.memberId) {
      messageId = await ctx.db.insert("whatsappMessages", {
        matchId: instance.matchId || undefined,
        memberId: instance.memberId,
        direction: "outbound",
        messageType: args.mediaUrl ? "media" : "text",
        content: resolvedMessage,
        status: "sent",
        createdAt: Date.now(),
      });

      // Schedule Twilio send
      const phone = await getMemberPhone(ctx, instance.memberId);
      if (phone) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.twilio.whatsapp.sendTextMessage,
          {
            to: phone,
            body: resolvedMessage,
            whatsappMessageId: messageId,
          }
        );
      }
    }

    const duration = Date.now() - startTime;

    // Log execution
    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.MESSAGE,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({ template: args.template, channel: args.channel }),
      output: JSON.stringify({
        resolvedMessage,
        memberId: instance.memberId,
        messageId,
      }),
      duration,
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// executeDecisionNode — Set instance to waiting state
// ============================================================================

export const executeDecisionNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    question: v.string(),
    options: v.array(
      v.object({
        value: v.string(),
        label: v.string(),
        edgeId: v.string(),
      })
    ),
    timeout: v.optional(v.number()),
    timeoutEdgeId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const context = instance.context as FlowContext;
    const resolvedQuestion = resolveTemplate(args.question, context);

    // Send the question as a WhatsApp interactive message
    let messageId: string | undefined;
    if (instance.memberId) {
      messageId = await ctx.db.insert("whatsappMessages", {
        matchId: instance.matchId || undefined,
        memberId: instance.memberId,
        direction: "outbound",
        messageType: "interactive",
        content: JSON.stringify({
          question: resolvedQuestion,
          options: args.options.map((opt) => ({
            value: opt.value,
            label: opt.label,
          })),
        }),
        status: "sent",
        createdAt: Date.now(),
      });

      // Schedule Twilio send with interactive buttons/list
      const phone = await getMemberPhone(ctx, instance.memberId);
      if (phone) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.twilio.interactive.sendInteractiveMessage,
          {
            to: phone,
            question: resolvedQuestion,
            options: args.options.map((opt) => ({
              value: opt.value,
              label: opt.label,
            })),
            whatsappMessageId: messageId,
          }
        );
      }
    }

    // Update context to waiting state
    const updatedContext: FlowContext = {
      ...context,
      waitingForInput: true,
      waitingNodeId: args.nodeId,
    };

    // Schedule timeout if configured
    let schedulerJobId: string | undefined;
    if (args.timeout && args.timeout > 0) {
      schedulerJobId = await ctx.scheduler.runAfter(
        args.timeout,
        internal.engine.transitions.handleDecisionTimeout,
        {
          flowInstanceId: args.flowInstanceId,
          nodeId: args.nodeId,
        }
      );
    }

    await ctx.db.patch(args.flowInstanceId, {
      context: updatedContext,
      lastTransitionAt: Date.now(),
      ...(schedulerJobId ? { schedulerJobId } : {}),
    });

    const duration = Date.now() - startTime;

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.DECISION,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({ question: resolvedQuestion }),
      output: JSON.stringify({
        waitingForInput: true,
        optionCount: args.options.length,
        messageId,
        timeoutMs: args.timeout || null,
      }),
      duration,
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// executeActionNode — Dispatch to appropriate action handler
// ============================================================================

export const executeActionNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    actionType: v.string(),
    params: v.any(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const context = instance.context as FlowContext;
    let actionResult: Record<string, any> = {};

    switch (args.actionType) {
      case "sync_to_sma": {
        // Extract structured feedback from flow context responses
        const responses = context.responses || {};

        // Decision: from the initial decision_response node
        const decision = responses.decision_response?.selectedOption || context.memberDecision || "unknown";

        // Primary reasons: from decision_why_not (may have been visited multiple times via loop)
        // Also check feedbackCategories array which accumulates across loops
        const primaryCategories: string[] = [...(context.feedbackCategories || [])];
        if (responses.decision_why_not?.selectedOption) {
          const reason = responses.decision_why_not.selectedOption;
          if (!primaryCategories.includes(reason)) {
            primaryCategories.push(reason);
          }
        }

        // Sub-categories: from fb_* nodes (keyed by feedback type)
        const subCategories: Record<string, string> = {};
        for (const [nodeId, response] of Object.entries(responses)) {
          if (nodeId.startsWith("fb_") && (response as any)?.selectedLabel) {
            const feedbackType = nodeId.replace("fb_", "");
            subCategories[feedbackType] = (response as any).selectedLabel;
          }
        }

        // Free text: from fb_other node or feedbackFreeText
        const freeText = responses.fb_other?.rawInput || context.feedbackFreeText || undefined;

        // 1. Create feedback record
        let feedbackId: string | undefined;
        if (instance.memberId && instance.matchId) {
          feedbackId = await ctx.db.insert("feedback", {
            matchId: instance.matchId,
            memberId: instance.memberId,
            flowInstanceId: args.flowInstanceId,
            decision,
            categories: primaryCategories.length > 0 ? primaryCategories : undefined,
            subCategories: Object.keys(subCategories).length > 0 ? subCategories : undefined,
            freeText,
            rawResponses: responses,
            smaMatchNotesSynced: false,
            createdAt: Date.now(),
          });
        }

        // 2. Schedule async LLM analysis of free-text feedback
        if (feedbackId && freeText) {
          await ctx.scheduler.runAfter(
            0,
            internal.integrations.openrouter.analyze.analyzeFeedback,
            {
              feedbackId,
              freeText,
              existingCategories: primaryCategories.length > 0 ? primaryCategories : undefined,
              decision,
              memberFirstName: context.metadata?.memberFirstName,
            }
          );
        }

        // 3. Update match status (§4.4: Active → Rejected Introductions)
        //    and write match notes (§7.2)
        if (instance.matchId) {
          await ctx.db.patch(instance.matchId, {
            status: "rejected",
            responseType: "not_interested",
            matchNotes: {
              member_id: instance.memberId,
              response_type: "not_interested",
              rejection_reasons: primaryCategories.map((cat) => ({
                primary: cat,
                secondary: subCategories[cat] || null,
                free_text: cat === "other" ? freeText : null,
              })),
              upsell_offered: false,
              upsell_accepted: false,
              payment_status: null,
              final_status: "rejected",
              timestamp: new Date().toISOString(),
            },
            updatedAt: Date.now(),
          });
        }

        // 4. Increment member rejection count + store on context for condition check
        if (instance.memberId && decision === "not_interested") {
          // Read current count synchronously so the downstream condition node
          // sees the correct value (the async incrementRejectionCount may not
          // have landed by the time the condition evaluates).
          const member = await ctx.db.get(instance.memberId);
          const currentCount = (member as any)?.rejectionCount ?? 0;
          const newCount = currentCount + 1;

          // Store on flow context — evaluateConditionExpression checks
          // context[field] first, so "rejectionCount >= 3" will read this.
          const ctxWithCount: FlowContext = {
            ...context,
            rejectionCount: newCount,
          };
          await ctx.db.patch(args.flowInstanceId, {
            context: ctxWithCount,
            lastTransitionAt: Date.now(),
          });

          await ctx.scheduler.runAfter(
            0,
            internal.members.mutations.incrementRejectionCount,
            { memberId: instance.memberId }
          );
        }

        actionResult = {
          type: "sync_to_sma",
          feedbackId,
          memberId: instance.memberId,
          matchId: instance.matchId,
          decision,
          primaryCategories,
          subCategories,
          freeText,
          matchStatusUpdated: true,
          rejectionCountIncremented: decision === "not_interested",
          status: "completed",
        };
        break;
      }

      case "notify_admin": {
        // Log admin notification
        actionResult = {
          type: "notify_admin",
          memberId: instance.memberId,
          matchId: instance.matchId,
          notification: args.params?.message || "Flow requires attention",
          status: "queued",
        };
        break;
      }

      case "update_match_status": {
        // Update match status + responseType + matchNotes per §7.1 / §7.2
        if (instance.matchId) {
          const finalStatus = args.params?.final_status;
          const responseType = args.params?.response_type;
          const note = args.params?.note;

          const patch: Record<string, any> = { updatedAt: Date.now() };

          if (finalStatus) patch.status = finalStatus;
          if (responseType) patch.responseType = responseType;
          if (note) {
            patch.matchNotes = {
              member_id: instance.memberId,
              response_type: responseType || finalStatus,
              note,
              upsell_offered: args.params?.upsell_offered ?? false,
              upsell_accepted: args.params?.upsell_accepted ?? false,
              final_status: finalStatus,
              timestamp: new Date().toISOString(),
            };
          }

          await ctx.db.patch(instance.matchId, patch);
          actionResult = {
            type: "update_match_status",
            matchId: instance.matchId,
            newStatus: finalStatus,
            responseType,
            status: "completed",
          };
        }
        break;
      }

      case "create_stripe_link": {
        // Create a pending payment record and schedule Stripe checkout creation
        if (instance.memberId && instance.matchId) {
          const paymentId = await ctx.db.insert("payments", {
            matchId: instance.matchId,
            memberId: instance.memberId,
            type: "personal_outreach",
            amount: args.params?.amount || 12500, // $125 in cents
            phase: "initial",
            flowInstanceId: args.flowInstanceId,
            status: "pending",
            createdAt: Date.now(),
          });

          // Schedule Stripe checkout session creation (action — calls external API)
          await ctx.scheduler.runAfter(
            0,
            internal.integrations.stripe.checkout.createCheckoutAndNotify,
            {
              paymentId,
              flowInstanceId: args.flowInstanceId,
              memberId: instance.memberId,
              matchId: instance.matchId,
              amount: args.params?.amount || 12500,
            }
          );

          // Set flow to waiting for payment
          const paymentContext: FlowContext = {
            ...context,
            waitingForInput: true,
            waitingNodeId: args.nodeId,
            metadata: {
              ...context.metadata,
              awaitingPayment: true,
              paymentId: String(paymentId),
            },
          };
          await ctx.db.patch(args.flowInstanceId, {
            context: paymentContext,
            lastTransitionAt: Date.now(),
          });

          actionResult = {
            type: "create_stripe_link",
            paymentId,
            status: "checkout_scheduled",
          };
        }
        break;
      }

      case "send_introduction": {
        // Log that an introduction should be sent
        actionResult = {
          type: "send_introduction",
          memberId: instance.memberId,
          matchId: instance.matchId,
          consentGiven: context.consentGiven,
          status: "queued",
        };
        break;
      }

      case "create_group_chat": {
        // Log that a group chat should be created
        actionResult = {
          type: "create_group_chat",
          matchId: instance.matchId,
          status: "queued",
        };
        break;
      }

      case "schedule_recalibration": {
        // Update member status to recalibrating
        if (instance.memberId) {
          await ctx.db.patch(instance.memberId, {
            status: "recalibrating",
            updatedAt: Date.now(),
          });
          actionResult = {
            type: "schedule_recalibration",
            memberId: instance.memberId,
            status: "scheduled",
          };
        }
        break;
      }

      case "expire_match": {
        // Move match to "expired" status after 8-day follow-up sequence
        if (instance.matchId) {
          await ctx.db.patch(instance.matchId, {
            status: args.params?.target_status || "expired",
            responseType: args.params?.response_type || "no_response",
            matchNotes: {
              member_id: instance.memberId,
              response_type: "no_response",
              note: args.params?.note || "No response after follow-up sequence.",
              actions: args.params?.actions || [],
              final_status: "expired",
              timestamp: new Date().toISOString(),
            },
            updatedAt: Date.now(),
          });
        }

        actionResult = {
          type: "expire_match",
          matchId: instance.matchId,
          status: "expired",
        };
        break;
      }

      default: {
        actionResult = {
          type: args.actionType,
          status: "unknown_action_type",
        };
      }
    }

    // Re-read the instance to pick up any context changes made during the
    // switch (e.g., create_stripe_link sets waitingForInput: true).
    // Without this, we'd overwrite those changes with the stale `context`.
    const freshInstance = await ctx.db.get(args.flowInstanceId);
    if (!freshInstance) return;
    const latestContext = freshInstance.context as FlowContext;

    // Update context metadata with action result
    const updatedContext: FlowContext = {
      ...latestContext,
      metadata: {
        ...latestContext.metadata,
        [`action_${args.nodeId}`]: actionResult,
      },
      timestamps: {
        ...latestContext.timestamps,
        [`action_${args.nodeId}`]: Date.now(),
      },
    };

    await ctx.db.patch(args.flowInstanceId, {
      context: updatedContext,
      lastTransitionAt: Date.now(),
    });

    const duration = Date.now() - startTime;

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.ACTION,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({ actionType: args.actionType, params: args.params }),
      output: JSON.stringify(actionResult),
      duration,
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// executeDelayNode — Handled by the interpreter via scheduler
// ============================================================================

export const executeDelayNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    duration: v.number(),
    unit: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const context = instance.context as FlowContext;
    const updatedContext: FlowContext = {
      ...context,
      timestamps: {
        ...context.timestamps,
        [`delay_started_${args.nodeId}`]: Date.now(),
      },
    };

    await ctx.db.patch(args.flowInstanceId, {
      context: updatedContext,
      lastTransitionAt: Date.now(),
    });

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.DELAY,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({ duration: args.duration, unit: args.unit }),
      output: JSON.stringify({ scheduledWakeUp: true }),
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// executeConditionNode — Evaluate expression against context
// ============================================================================

export const executeConditionNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    expression: v.string(),
    trueEdgeId: v.string(),
    falseEdgeId: v.string(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const context = instance.context as FlowContext;
    const result = evaluateConditionExpression(args.expression, context);

    const duration = Date.now() - startTime;

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.CONDITION,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({ expression: args.expression }),
      output: JSON.stringify({ result, selectedEdge: result ? args.trueEdgeId : args.falseEdgeId }),
      duration,
      timestamp: Date.now(),
    });

    return result;
  },
});

// ============================================================================
// executeFeedbackCollectNode — Send feedback prompt, wait for response
// ============================================================================

export const executeFeedbackCollectNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    categories: v.array(v.string()),
    allowFreeText: v.boolean(),
    feedbackType: v.string(),
    prompt: v.optional(v.string()),
    timeout: v.optional(v.number()),
    timeoutMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const context = instance.context as FlowContext;

    // Use spec-specific prompt from node config, fall back to generic
    const feedbackPrompt = args.prompt ||
      "I totally get it. I'm here to help you find that amazing match. Just so I can refine your future matches — would you mind sharing a bit about what didn't click?";

    // Send feedback collection message
    let messageId: string | undefined;
    if (instance.memberId) {
      messageId = await ctx.db.insert("whatsappMessages", {
        matchId: instance.matchId || undefined,
        memberId: instance.memberId,
        direction: "outbound",
        messageType: "interactive",
        content: JSON.stringify({
          feedbackType: args.feedbackType,
          categories: args.categories,
          allowFreeText: args.allowFreeText,
          prompt: feedbackPrompt,
        }),
        status: "sent",
        createdAt: Date.now(),
      });

      // Schedule Twilio send — interactive buttons if categories exist, plain text for free-text nodes
      const phone = await getMemberPhone(ctx, instance.memberId);
      if (phone) {
        if (args.categories.length > 0) {
          await ctx.scheduler.runAfter(
            0,
            internal.integrations.twilio.interactive.sendInteractiveMessage,
            {
              to: phone,
              question: feedbackPrompt,
              options: args.categories.map((cat) => ({
                value: cat,
                label: cat.replace(/_/g, " "),
              })),
              whatsappMessageId: messageId,
            }
          );
        } else {
          await ctx.scheduler.runAfter(
            0,
            internal.integrations.twilio.whatsapp.sendTextMessage,
            {
              to: phone,
              body: feedbackPrompt,
              whatsappMessageId: messageId,
            }
          );
        }
      }
    }

    // Set waiting state
    const updatedContext: FlowContext = {
      ...context,
      waitingForInput: true,
      waitingNodeId: args.nodeId,
    };

    // Schedule timeout if configured
    let schedulerJobId: string | undefined;
    if (args.timeout && args.timeout > 0) {
      schedulerJobId = await ctx.scheduler.runAfter(
        args.timeout,
        internal.engine.transitions.handleFeedbackCollectTimeout,
        {
          flowInstanceId: args.flowInstanceId,
          nodeId: args.nodeId,
        }
      );
    }

    await ctx.db.patch(args.flowInstanceId, {
      context: updatedContext,
      lastTransitionAt: Date.now(),
      schedulerJobId: schedulerJobId ?? undefined,
    });

    const duration = Date.now() - startTime;

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.FEEDBACK_COLLECT,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({
        categories: args.categories,
        feedbackType: args.feedbackType,
      }),
      output: JSON.stringify({ waitingForFeedback: true, messageId, timeoutMs: args.timeout || null }),
      duration,
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// executeEndNode — Mark flow as completed
// ============================================================================

export const executeEndNode = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    endType: v.string(),
  },
  handler: async (ctx, args) => {
    const startTime = Date.now();
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) {
      throw new Error(`Flow instance ${args.flowInstanceId} not found`);
    }

    const finalStatus =
      args.endType === "completed"
        ? INSTANCE_STATUS.COMPLETED
        : args.endType === "expired"
          ? INSTANCE_STATUS.EXPIRED
          : args.endType === "error"
            ? INSTANCE_STATUS.ERROR
            : INSTANCE_STATUS.COMPLETED;

    await ctx.db.patch(args.flowInstanceId, {
      status: finalStatus,
      completedAt: Date.now(),
      lastTransitionAt: Date.now(),
    });

    const duration = Date.now() - startTime;

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.END,
      action: EXECUTION_ACTIONS.EXECUTED,
      input: JSON.stringify({ endType: args.endType }),
      output: JSON.stringify({ finalStatus }),
      duration,
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// executeReminderMessage — Send a reminder during a delay
// ============================================================================

export const executeReminderMessage = internalMutation({
  args: {
    flowInstanceId: v.id("flowInstances"),
    nodeId: v.string(),
    template: v.string(),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return;

    // Only send if instance is still active
    if (instance.status !== INSTANCE_STATUS.ACTIVE) return;

    const context = instance.context as FlowContext;
    const resolvedMessage = resolveTemplate(args.template, context);

    if (instance.memberId) {
      const messageId = await ctx.db.insert("whatsappMessages", {
        matchId: instance.matchId || undefined,
        memberId: instance.memberId,
        direction: "outbound",
        messageType: "text",
        content: resolvedMessage,
        status: "sent",
        createdAt: Date.now(),
      });

      // Schedule Twilio send
      const phone = await getMemberPhone(ctx, instance.memberId);
      if (phone) {
        await ctx.scheduler.runAfter(
          0,
          internal.integrations.twilio.whatsapp.sendTextMessage,
          {
            to: phone,
            body: resolvedMessage,
            whatsappMessageId: messageId,
          }
        );
      }
    }

    await ctx.db.insert("flowExecutionLogs", {
      instanceId: args.flowInstanceId,
      nodeId: args.nodeId,
      nodeType: NODE_TYPES.DELAY,
      action: "reminder_sent",
      output: JSON.stringify({ reminderMessage: resolvedMessage }),
      timestamp: Date.now(),
    });
  },
});

// ============================================================================
// Helpers
// ============================================================================

/**
 * Resolve template variables like {{memberName}}, {{matchName}}, etc.
 */
function resolveTemplate(template: string, context: FlowContext): string {
  let resolved = template;

  // Replace {{key}} patterns with context values
  const variablePattern = /\{\{(\w+)\}\}/g;
  resolved = resolved.replace(variablePattern, (match, key) => {
    if (key in (context.metadata || {})) {
      return String(context.metadata[key]);
    }
    if (key in context) {
      return String((context as any)[key]);
    }
    return match; // Keep original if no replacement found
  });

  return resolved;
}

/**
 * Evaluate a condition expression against flow context.
 */
function evaluateConditionExpression(
  expression: string,
  context: FlowContext
): boolean {
  try {
    const match = expression.match(
      /^(\w+)\s*(>=|<=|==|!=|>|<)\s*(.+)$/
    );
    if (!match) return false;

    const [, field, operator, rawValue] = match;

    let fieldValue: any;
    if (field in context) {
      fieldValue = (context as any)[field];
    } else if (field in (context.metadata || {})) {
      fieldValue = context.metadata[field];
    } else {
      fieldValue = undefined;
    }

    let compareValue: any = rawValue.trim();
    if (compareValue === "true") compareValue = true;
    else if (compareValue === "false") compareValue = false;
    else if (!isNaN(Number(compareValue))) compareValue = Number(compareValue);
    else compareValue = compareValue.replace(/['"]/g, "");

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
