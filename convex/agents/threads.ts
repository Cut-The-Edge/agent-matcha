// @ts-nocheck
/**
 * Agent Thread Management
 *
 * Manages conversation threads between the Agent Matcha AI and club members.
 * Each member gets a thread per match context, allowing the agent to maintain
 * conversation history and context across multiple interactions.
 *
 * These threads are stored in the Agent SDK's built-in thread/message system
 * (separate from the whatsappMessages table). The whatsappMessages table
 * continues to store the actual WhatsApp message log, while agent threads
 * store the AI reasoning and conversation context.
 */

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "../_generated/server";
import { components } from "../_generated/api";
import { createThread } from "@convex-dev/agent";

// ============================================================================
// agentThreads — Schema note
// ============================================================================
// Agent threads are stored inside the agent component's internal tables.
// We maintain a mapping table in our own schema to link:
//   memberId + matchId -> agentThreadId
// This is stored in a lightweight "agentThreadMap" concept using metadata
// conventions: the thread's `userId` field stores the memberId string,
// and the thread `title` encodes the match context.

// ============================================================================
// getOrCreateThread
// ============================================================================

/**
 * Find an existing agent thread for a member (optionally scoped to a match),
 * or create a new one. Returns the thread ID from the agent component.
 *
 * Convention:
 *   - userId = memberId (as string, for the agent SDK)
 *   - title = "match:<matchId>" or "general:<memberId>"
 *   - summary = human-readable description
 */
export const getOrCreateThread = internalMutation({
  args: {
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
  },
  handler: async (ctx, args) => {
    const userId = args.memberId as string;
    const title = args.matchId
      ? `match:${args.matchId}`
      : `general:${args.memberId}`;

    // Look up member name for the summary
    const member = await ctx.db.get(args.memberId);
    const memberName = member
      ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
      : "Unknown Member";

    let summary: string;
    if (args.matchId) {
      const match = await ctx.db.get(args.matchId);
      if (match) {
        // Figure out who the other person is
        const otherMemberId =
          match.memberAId === args.memberId
            ? match.memberBId
            : match.memberAId;
        const otherMember = await ctx.db.get(otherMemberId);
        const otherName = otherMember
          ? `${otherMember.firstName}${otherMember.lastName ? ` ${otherMember.lastName}` : ""}`
          : "their match";
        summary = `Match feedback conversation with ${memberName} about ${otherName}`;
      } else {
        summary = `Match conversation with ${memberName}`;
      }
    } else {
      summary = `General conversation with ${memberName}`;
    }

    // Create a new thread in the agent component.
    // The Agent SDK doesn't have a "find thread by title" API, so we
    // always create a new thread. For idempotency in real usage, the
    // caller should cache the threadId on the flow instance context.
    const threadId = await createThread(ctx, components.agent, {
      userId,
      title,
      summary,
    });

    return { threadId, userId, title, summary };
  },
});

// ============================================================================
// addMessageToThread
// ============================================================================

/**
 * Add a message to an agent thread. Used to inject WhatsApp messages
 * (both inbound from the member and outbound from the bot) into the
 * agent's conversation history so it has full context.
 */
export const addMessageToThread = internalMutation({
  args: {
    threadId: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    memberId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    // Use the agent component's addMessages mutation to save a message
    // into the thread's history.
    const userId = args.memberId ? (args.memberId as string) : undefined;

    await ctx.runMutation(components.agent.messages.addMessages, {
      threadId: args.threadId,
      userId,
      messages: [
        {
          message: {
            role: args.role,
            content: args.content,
          },
        },
      ],
    });

    return { success: true };
  },
});

// ============================================================================
// getThreadMessages
// ============================================================================

/**
 * Get all messages in an agent thread.
 * Returns them in chronological order for display or context building.
 */
export const getThreadMessages = internalQuery({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Use the component's query directly since we're in a query context
    const result = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: args.threadId,
        paginationOpts: { numItems: limit, cursor: null },
      },
    );

    return {
      messages: result.page,
      hasMore: result.continueCursor !== null,
    };
  },
});

// ============================================================================
// listActiveThreads
// ============================================================================

/**
 * List all active agent threads with member info.
 * "Active" = threads where the associated flow instance is still running.
 * This is a public query for the admin dashboard.
 */
export const listActiveThreads = query({
  args: {
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Get active flow instances that have context with an agentThreadId
    const activeInstances = await ctx.db
      .query("flowInstances")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(limit);

    const threads = [];

    for (const instance of activeInstances) {
      const context = instance.context as any;
      const agentThreadId = context?.metadata?.agentThreadId;

      if (!agentThreadId) continue;

      // Resolve member info
      let memberName = "Unknown";
      let memberPhone = null;
      if (instance.memberId) {
        const member = await ctx.db.get(instance.memberId);
        if (member) {
          memberName = `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`;
          memberPhone = member.phone;
        }
      }

      // Resolve match info
      let matchInfo = null;
      if (instance.matchId) {
        const match = await ctx.db.get(instance.matchId);
        if (match) {
          matchInfo = {
            matchId: match._id,
            status: match.status,
          };
        }
      }

      threads.push({
        agentThreadId,
        flowInstanceId: instance._id,
        memberId: instance.memberId,
        memberName,
        memberPhone,
        matchInfo,
        currentNodeId: instance.currentNodeId,
        startedAt: instance.startedAt,
        lastTransitionAt: instance.lastTransitionAt,
      });
    }

    return threads;
  },
});
