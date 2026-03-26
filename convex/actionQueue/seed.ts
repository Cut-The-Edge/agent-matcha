// @ts-nocheck
/**
 * Seed test action queue items for dashboard preview.
 * Run from Convex dashboard: actionQueue.seed.seedTestItems
 */

import { internalMutation } from "../_generated/server";

export const seedTestItems = internalMutation({
  handler: async (ctx) => {
    // Grab a few real members
    const members = await ctx.db.query("members").take(4);
    if (members.length < 2) {
      console.error("[seed] Need at least 2 members in the DB");
      return;
    }

    // Grab a real match if one exists
    const match = await ctx.db.query("matches").first();

    const now = Date.now();
    const HOUR = 60 * 60 * 1000;

    const testItems = [
      {
        memberId: members[0]._id,
        matchId: match?._id,
        type: "outreach_needed",
        priority: "high",
        status: "pending",
        context: {
          paymentAmount: 12500,
          paidAt: now - 3 * HOUR,
        },
        createdAt: now - 3 * HOUR,
        updatedAt: now - 3 * HOUR,
      },
      {
        memberId: members[1]._id,
        matchId: match?._id,
        type: "outreach_needed",
        priority: "urgent",
        status: "in_progress",
        context: {
          paymentAmount: 12500,
          paidAt: now - 26 * HOUR,
        },
        outreachContactedAt: now - 12 * HOUR,
        createdAt: now - 26 * HOUR,
        updatedAt: now - 12 * HOUR,
      },
      {
        memberId: members.length > 2 ? members[2]._id : members[0]._id,
        type: "frustrated_member",
        priority: "urgent",
        status: "pending",
        context: {
          memberMessage: "This is ridiculous, I've been waiting forever",
          description: "Frustrated language detected",
        },
        createdAt: now - 1 * HOUR,
        updatedAt: now - 1 * HOUR,
      },
      {
        memberId: members.length > 3 ? members[3]._id : members[1]._id,
        type: "recalibration_due",
        priority: "medium",
        status: "pending",
        context: {
          reason: "rejection_threshold",
        },
        createdAt: now - 48 * HOUR,
        updatedAt: now - 48 * HOUR,
      },
      {
        memberId: members[0]._id,
        matchId: match?._id,
        type: "outreach_needed",
        priority: "low",
        status: "resolved",
        outreachOutcome: "match_interested",
        outreachNotes: "Spoke with Sarah — she's excited about the intro. Loves that he's also into hiking.",
        matchIntelligenceBrief: "Key talking points:\n- Both are outdoor enthusiasts\n- Similar career stage (mid-level professionals)\n- Both value family and Jewish traditions\n- She mentioned preferring someone who's active and adventurous",
        outreachContactedAt: now - 72 * HOUR,
        resolvedAt: now - 70 * HOUR,
        context: {
          paymentAmount: 12500,
          paidAt: now - 96 * HOUR,
        },
        createdAt: now - 96 * HOUR,
        updatedAt: now - 70 * HOUR,
      },
    ];

    let created = 0;
    for (const item of testItems) {
      await ctx.db.insert("actionQueue", item as any);
      created++;
    }

    console.log(`[seed] Created ${created} test action queue items`);
    return { created };
  },
});
