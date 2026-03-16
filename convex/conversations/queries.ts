// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * List all messages for a member, ordered by createdAt ascending (chronological).
 */
export const listByMember = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 200;

    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("asc")
      .take(limit);

    return messages;
  },
});

/**
 * List all messages related to a match (both parties).
 * Gets messages from both member A and member B for the given match.
 */
export const listByMatch = query({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 200;

    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();

    // Sort by createdAt asc and limit
    const sorted = messages
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);

    // Resolve member names
    const enriched = await Promise.all(
      sorted.map(async (msg) => {
        const member = await ctx.db.get(msg.memberId);
        return {
          ...msg,
          memberName: member
            ? `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`
            : "Unknown",
        };
      })
    );

    return enriched;
  },
});

/**
 * Get conversation summaries — one row per member who has messages.
 * Returns member info, last message preview, message counts, and timestamps.
 */
export const getConversationSummaries = query({
  args: {
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 100;

    // Get all messages ordered by creation time (most recent first)
    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_created")
      .order("desc")
      .collect();

    // Group messages by memberId to build summaries
    const memberMap = new Map<
      string,
      {
        memberId: string;
        totalMessages: number;
        inboundCount: number;
        outboundCount: number;
        failedCount: number;
        lastMessage: typeof messages[0];
      }
    >();

    for (const msg of messages) {
      const key = msg.memberId as string;
      const existing = memberMap.get(key);
      if (existing) {
        existing.totalMessages++;
        if (msg.direction === "inbound") existing.inboundCount++;
        else existing.outboundCount++;
        if (msg.status === "failed") existing.failedCount++;
      } else {
        memberMap.set(key, {
          memberId: key,
          totalMessages: 1,
          inboundCount: msg.direction === "inbound" ? 1 : 0,
          outboundCount: msg.direction === "outbound" ? 1 : 0,
          failedCount: msg.status === "failed" ? 1 : 0,
          lastMessage: msg,
        });
      }
    }

    // Convert to array and limit
    const summaryEntries = Array.from(memberMap.values()).slice(0, limit);

    // Resolve member names
    const summaries = await Promise.all(
      summaryEntries.map(async (entry) => {
        const member = await ctx.db.get(entry.memberId as any);
        const memberName = member
          ? `${member.firstName}${member.lastName ? " " + member.lastName : ""}`
          : "Unknown Member";
        const phone = member?.phone ?? null;

        return {
          memberId: entry.memberId,
          memberName,
          phone,
          totalMessages: entry.totalMessages,
          inboundCount: entry.inboundCount,
          outboundCount: entry.outboundCount,
          failedCount: entry.failedCount,
          lastMessageTimestamp: entry.lastMessage.createdAt,
          lastMessageDirection: entry.lastMessage.direction,
          lastMessagePreview: (() => {
            let preview = entry.lastMessage.content;
            // Extract readable text from interactive JSON messages
            if (entry.lastMessage.messageType === "interactive") {
              try {
                const parsed = JSON.parse(preview);
                preview = parsed.question || parsed.body || preview;
              } catch {
                // keep raw content
              }
            }
            return preview.length > 80
              ? preview.slice(0, 80) + "..."
              : preview;
          })(),
          lastMessageStatus: entry.lastMessage.status,
          hasErrors: entry.failedCount > 0,
        };
      })
    );

    return summaries;
  },
});

/**
 * Get count of inbound messages that have not yet been processed.
 * "Unread" = inbound messages with status "delivered" (not yet read).
 */
export const getUnreadCount = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMessages = await ctx.db.query("whatsappMessages").collect();

    const unreadCount = allMessages.filter(
      (m) => m.direction === "inbound" && m.status === "delivered"
    ).length;

    return { unreadCount };
  },
});

/**
 * Get count of unread messages for a specific member.
 */
export const getUnreadCountByMember = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .collect();

    const unreadCount = messages.filter(
      (m) => m.direction === "inbound" && m.status === "delivered"
    ).length;

    return { unreadCount };
  },
});

/**
 * Backward-compatible alias for getConversationSummaries.
 * Existing frontend code references this name.
 */
export const listConversationSummaries = getConversationSummaries;
