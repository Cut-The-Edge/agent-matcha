// @ts-nocheck
/**
 * Temporary public seed for testing — delete after use.
 */

import { mutation } from "../_generated/server";

// Clear all existing test items and re-seed
export const resetAndSeed = mutation({
  handler: async (ctx) => {
    // Delete all existing action queue items
    const existing = await ctx.db.query("actionQueue").collect();
    for (const item of existing) {
      await ctx.db.delete(item._id);
    }

    const members = await ctx.db.query("members").take(4);
    if (members.length < 2) {
      throw new Error("Need at least 2 members in the DB");
    }

    // Get different matches for variety
    const matches = await ctx.db.query("matches").take(3);
    const match1 = matches[0] || null;
    const match2 = matches[1] || match1;

    const now = Date.now();
    const HOUR = 60 * 60 * 1000;

    const testItems = [
      // 1. Fresh outreach needed — Dani hasn't started yet
      {
        memberId: members[0]._id,
        matchId: match1?._id,
        type: "outreach_needed",
        priority: "high",
        status: "pending",
        context: { paymentAmount: 12500, paidAt: now - 2 * HOUR },
        createdAt: now - 2 * HOUR,
        updatedAt: now - 2 * HOUR,
      },
      // 2. In progress — Dani is working on outreach
      {
        memberId: members[1]._id,
        matchId: match2?._id,
        type: "outreach_needed",
        priority: "urgent",
        status: "in_progress",
        context: { paymentAmount: 12500, paidAt: now - 30 * HOUR },
        outreachContactedAt: now - 6 * HOUR,
        createdAt: now - 30 * HOUR,
        updatedAt: now - 6 * HOUR,
      },
      // 3. Frustrated member alert
      {
        memberId: members.length > 2 ? members[2]._id : members[0]._id,
        type: "frustrated_member",
        priority: "urgent",
        status: "pending",
        context: {
          memberMessage: "This is ridiculous, I've been waiting forever",
          description: "Frustrated language detected",
        },
        createdAt: now - 45 * 60 * 1000,
        updatedAt: now - 45 * 60 * 1000,
      },
      // 4. Recalibration needed — aging (48h old)
      {
        memberId: members.length > 3 ? members[3]._id : members[1]._id,
        type: "recalibration_due",
        priority: "medium",
        status: "pending",
        context: { reason: "rejection_threshold" },
        createdAt: now - 50 * HOUR,
        updatedAt: now - 50 * HOUR,
      },
      // 5. Previously resolved — match interested with full brief
      {
        memberId: members[0]._id,
        matchId: match1?._id,
        type: "outreach_needed",
        priority: "low",
        status: "resolved",
        outreachOutcome: "match_interested",
        outreachNotes: "Spoke with Sarah — she's excited about the intro. Loves that he's also into hiking.",
        matchIntelligenceBrief: "Key talking points:\n- Both outdoor enthusiasts (hiking, running)\n- Similar career stage (mid-level professionals)\n- Both value family and Jewish traditions\n- She mentioned preferring someone active and adventurous",
        outreachContactedAt: now - 72 * HOUR,
        resolvedAt: now - 70 * HOUR,
        context: { paymentAmount: 12500, paidAt: now - 96 * HOUR },
        createdAt: now - 96 * HOUR,
        updatedAt: now - 70 * HOUR,
      },
    ];

    let created = 0;
    for (const item of testItems) {
      await ctx.db.insert("actionQueue", item as any);
      created++;
    }

    return { created, deleted: existing.length };
  },
});

export const seedTestItems = mutation({
  handler: async (ctx) => {
    // Alias for backward compat
    return "Use resetAndSeed instead";
  },
});
