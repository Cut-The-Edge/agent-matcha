// @ts-nocheck
/**
 * Monitor Queries — Real-time data for the Flow Monitor UI
 *
 * Three reactive queries that power the monitor dashboard:
 * 1. Instance + definition + member info in one call
 * 2. Execution logs sorted ascending (timeline display)
 * 3. WhatsApp messages for the instance's member, filtered to the match
 */

import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Get full flow instance with its definition and member info.
 * Single query avoids waterfall of separate fetches in the UI.
 */
export const getFlowInstanceWithDefinition = query({
  args: {
    flowInstanceId: v.id("flowInstances"),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.flowInstanceId);
    if (!instance) return null;

    const flowDef = await ctx.db.get(instance.flowDefinitionId);

    let member = null;
    if (instance.memberId) {
      member = await ctx.db.get(instance.memberId);
    }

    let match = null;
    if (instance.matchId) {
      match = await ctx.db.get(instance.matchId);
    }

    return {
      instance,
      flowDefinition: flowDef,
      member: member
        ? {
            _id: member._id,
            firstName: member.firstName,
            lastName: member.lastName,
            phone: member.phone,
            whatsappId: member.whatsappId,
            tier: member.tier,
          }
        : null,
      match: match
        ? {
            _id: match._id,
            status: match.status,
            memberAId: match.memberAId,
            memberBId: match.memberBId,
          }
        : null,
    };
  },
});

/**
 * Get execution logs sorted ascending by timestamp.
 * Ascending order is needed for the timeline display and
 * for the node status computation hook.
 */
export const getExecutionLogsAsc = query({
  args: {
    instanceId: v.id("flowInstances"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("flowExecutionLogs")
      .withIndex("by_instance", (q) => q.eq("instanceId", args.instanceId))
      .order("asc")
      .collect();
  },
});

/**
 * Get WhatsApp messages for a flow instance's member,
 * filtered to the instance's match.
 */
export const getWhatsAppMessagesByInstance = query({
  args: {
    instanceId: v.id("flowInstances"),
  },
  handler: async (ctx, args) => {
    const instance = await ctx.db.get(args.instanceId);
    if (!instance || !instance.memberId) return [];

    // Get messages for this member
    const messages = await ctx.db
      .query("whatsappMessages")
      .withIndex("by_member", (q) => q.eq("memberId", instance.memberId!))
      .order("asc")
      .collect();

    // Filter to the match if present
    if (instance.matchId) {
      return messages.filter(
        (m) => m.matchId === instance.matchId || !m.matchId
      );
    }

    return messages;
  },
});
