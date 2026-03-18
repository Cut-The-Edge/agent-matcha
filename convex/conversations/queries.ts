// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * List all messages for a member, ordered by createdAt ascending (chronological).
 * Includes WhatsApp messages and phone call transcript segments merged by time.
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

    // Get WhatsApp messages
    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("asc")
      .take(limit);

    // Get phone calls for this member
    const phoneCalls = await ctx.db
      .query("phoneCalls")
      .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
      .order("asc")
      .collect();

    // Get transcript segments for each call
    const callEvents = [];
    for (const call of phoneCalls) {
      const segments = await ctx.db
        .query("callTranscriptSegments")
        .withIndex("by_call", (q) => q.eq("callId", call._id))
        .order("asc")
        .collect();

      // Add a system event for call start
      callEvents.push({
        _id: `call-start-${call._id}`,
        _type: "system_event" as const,
        memberId: args.memberId,
        content: `Phone call ${call.direction === "inbound" ? "received" : "placed"} — ${call.status}${call.duration ? ` (${Math.round(call.duration / 60)}m ${call.duration % 60}s)` : ""}`,
        createdAt: call.startedAt,
        eventType: "call_start" as const,
        callId: call._id,
        callStatus: call.status,
        callDirection: call.direction,
      });

      // Add transcript segments as individual messages
      for (const seg of segments) {
        callEvents.push({
          _id: `transcript-${seg._id}`,
          _type: "phone_transcript" as const,
          memberId: args.memberId,
          content: seg.text,
          createdAt: seg.timestamp,
          speaker: seg.speaker,
          callId: call._id,
          confidence: seg.confidence,
        });
      }

      // Add call end system event if completed
      if (call.endedAt) {
        callEvents.push({
          _id: `call-end-${call._id}`,
          _type: "system_event" as const,
          memberId: args.memberId,
          content: call.aiSummary
            ? `Call ended — ${typeof call.aiSummary === "string" ? call.aiSummary : "AI summary available"}`
            : `Call ended`,
          createdAt: call.endedAt,
          eventType: "call_end" as const,
          callId: call._id,
          callStatus: call.status,
          callDirection: call.direction,
        });
      }
    }

    // Normalize WhatsApp messages into unified format
    const whatsappEvents = messages.map((msg) => ({
      ...msg,
      _type: "whatsapp" as const,
    }));

    // Merge all events by time
    const allEvents = [...whatsappEvents, ...callEvents]
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, limit);

    return allEvents;
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
 * Get conversation summaries — one row per member who has messages or phone calls.
 * Returns member info, last message preview, message counts, timestamps,
 * conversation status, and channel types (WhatsApp/Phone).
 */
export const getConversationSummaries = query({
  args: {
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 100;

    // Get all WhatsApp messages ordered by creation time (most recent first)
    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_created")
      .order("desc")
      .collect();

    // Get all phone calls ordered by creation time (most recent first)
    const phoneCalls = await ctx.db
      .query("phoneCalls")
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
        lastMessage: typeof messages[0] | null;
        hasWhatsApp: boolean;
        hasPhone: boolean;
        phoneCallCount: number;
        lastPhoneCall: typeof phoneCalls[0] | null;
        lastActivityTimestamp: number;
        hasActiveFlow: boolean;
        hasEscalation: boolean;
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
          hasWhatsApp: true,
          hasPhone: false,
          phoneCallCount: 0,
          lastPhoneCall: null,
          lastActivityTimestamp: msg.createdAt,
          hasActiveFlow: false,
          hasEscalation: false,
        });
      }
    }

    // Add phone call data
    for (const call of phoneCalls) {
      if (!call.memberId) continue;
      const key = call.memberId as string;
      const existing = memberMap.get(key);
      if (existing) {
        existing.hasPhone = true;
        existing.phoneCallCount++;
        if (!existing.lastPhoneCall) {
          existing.lastPhoneCall = call;
        }
        // Update last activity timestamp if this call is more recent
        const callTs = call.endedAt ?? call.startedAt;
        if (callTs > existing.lastActivityTimestamp) {
          existing.lastActivityTimestamp = callTs;
        }
        if (call.status === "transferred" || call.escalationReason) {
          existing.hasEscalation = true;
        }
      } else {
        memberMap.set(key, {
          memberId: key,
          totalMessages: 0,
          inboundCount: 0,
          outboundCount: 0,
          failedCount: 0,
          lastMessage: null,
          hasWhatsApp: false,
          hasPhone: true,
          phoneCallCount: 1,
          lastPhoneCall: call,
          lastActivityTimestamp: call.endedAt ?? call.startedAt,
          hasActiveFlow: false,
          hasEscalation: call.status === "transferred" || !!call.escalationReason,
        });
      }
    }

    // Check for active flow instances for each member
    const flowInstances = await ctx.db
      .query("flowInstances")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    for (const fi of flowInstances) {
      if (fi.memberId) {
        const key = fi.memberId as string;
        const existing = memberMap.get(key);
        if (existing) {
          existing.hasActiveFlow = true;
        }
      }
    }

    // Sort by last activity timestamp descending and limit
    const summaryEntries = Array.from(memberMap.values())
      .sort((a, b) => b.lastActivityTimestamp - a.lastActivityTimestamp)
      .slice(0, limit);

    // Resolve member names
    const summaries = await Promise.all(
      summaryEntries.map(async (entry) => {
        const member = await ctx.db.get(entry.memberId as any);
        const memberName = member
          ? `${member.firstName}${member.lastName ? " " + member.lastName : ""}`
          : "Unknown Member";
        const phone = member?.phone ?? null;

        // Determine conversation status
        let conversationStatus: "active" | "completed" | "escalated" | "failed" = "completed";
        if (entry.hasEscalation) {
          conversationStatus = "escalated";
        } else if (entry.hasActiveFlow || entry.lastPhoneCall?.status === "in_progress") {
          conversationStatus = "active";
        } else if (entry.failedCount > 0) {
          conversationStatus = "failed";
        }

        // Build last message preview
        let lastMessagePreview = "";
        let lastMessageDirection: "inbound" | "outbound" = "outbound";
        let lastMessageStatus: "sent" | "delivered" | "read" | "failed" = "sent";

        if (entry.lastMessage && entry.lastPhoneCall) {
          // Choose whichever is more recent
          const msgTs = entry.lastMessage.createdAt;
          const callTs = entry.lastPhoneCall.endedAt ?? entry.lastPhoneCall.startedAt;
          if (callTs > msgTs) {
            lastMessagePreview = `Phone call — ${entry.lastPhoneCall.status}`;
            lastMessageDirection = entry.lastPhoneCall.direction;
            lastMessageStatus = "delivered";
          } else {
            lastMessagePreview = extractPreview(entry.lastMessage);
            lastMessageDirection = entry.lastMessage.direction;
            lastMessageStatus = entry.lastMessage.status;
          }
        } else if (entry.lastMessage) {
          lastMessagePreview = extractPreview(entry.lastMessage);
          lastMessageDirection = entry.lastMessage.direction;
          lastMessageStatus = entry.lastMessage.status;
        } else if (entry.lastPhoneCall) {
          lastMessagePreview = `Phone call — ${entry.lastPhoneCall.status}`;
          lastMessageDirection = entry.lastPhoneCall.direction;
          lastMessageStatus = "delivered";
        }

        // Determine channels present
        const channels: ("whatsapp" | "phone")[] = [];
        if (entry.hasWhatsApp) channels.push("whatsapp");
        if (entry.hasPhone) channels.push("phone");

        return {
          memberId: entry.memberId,
          memberName,
          phone,
          totalMessages: entry.totalMessages,
          inboundCount: entry.inboundCount,
          outboundCount: entry.outboundCount,
          failedCount: entry.failedCount,
          lastActivityTimestamp: entry.lastActivityTimestamp,
          lastMessageTimestamp: entry.lastActivityTimestamp,
          lastMessageDirection: lastMessageDirection,
          lastMessagePreview,
          lastMessageStatus: lastMessageStatus,
          hasErrors: entry.failedCount > 0,
          conversationStatus,
          channels,
          phoneCallCount: entry.phoneCallCount,
        };
      })
    );

    return summaries;
  },
});

/** Helper to extract readable preview text from a message */
function extractPreview(msg: { content: string; messageType: string }): string {
  let preview = msg.content;
  if (msg.messageType === "interactive") {
    try {
      const parsed = JSON.parse(preview);
      preview = parsed.question || parsed.body || preview;
    } catch {
      // keep raw content
    }
  }
  return preview.length > 80 ? preview.slice(0, 80) + "..." : preview;
}

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
