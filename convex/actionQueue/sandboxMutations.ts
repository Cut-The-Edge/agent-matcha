// @ts-nocheck
/**
 * Action Queue Sandbox Mutations
 *
 * Creates a realistic test scenario for the outreach continuation flow:
 * 1. Creates a match between 2 members
 * 2. Creates a "paid" payment record ($125)
 * 3. Creates an "outreach_needed" action queue item
 *
 * This simulates what happens after a real member pays $125 for curated outreach.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";

// ============================================================================
// simulateOutreachScenario — One-click: match + payment + action item
// ============================================================================

export const simulateOutreachScenario = mutation({
  args: {
    payingMemberId: v.id("members"),
    matchPartnerId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const payingMember = await ctx.db.get(args.payingMemberId);
    if (!payingMember) throw new Error("Paying member not found");

    const matchPartner = await ctx.db.get(args.matchPartnerId);
    if (!matchPartner) throw new Error("Match partner not found");

    // Step 1: Create a test match
    const matchId = await ctx.db.insert("matches", {
      memberAId: args.payingMemberId,
      memberBId: args.matchPartnerId,
      status: "pending",
      responseType: "upsell_yes",
      matchNotes: {
        member_id: args.payingMemberId,
        response_type: "upsell_yes",
        upsell_offered: true,
        upsell_accepted: true,
        payment_status: "paid_first",
        final_status: "pending",
        sandbox: true,
        timestamp: new Date().toISOString(),
      },
      flowTriggered: false,
      smaIntroId: `sandbox-${now}`,
      createdAt: now,
      updatedAt: now,
    });

    // Step 2: Create a "paid" payment record
    const paymentId = await ctx.db.insert("payments", {
      matchId,
      memberId: args.payingMemberId,
      type: "personal_outreach",
      amount: 12500, // $125
      phase: "initial",
      status: "paid",
      stripeSessionId: `sandbox_cs_${now}`,
      stripePaymentIntentId: `sandbox_pi_${now}`,
      flowInstanceId: undefined,
      createdAt: now,
    });

    // Step 3: Create the action queue item
    const payingName = `${payingMember.firstName}${payingMember.lastName ? ` ${payingMember.lastName}` : ""}`;
    const partnerName = `${matchPartner.firstName}${matchPartner.lastName ? ` ${matchPartner.lastName}` : ""}`;

    const actionItemId = await ctx.db.insert("actionQueue", {
      memberId: args.payingMemberId,
      matchId,
      type: "outreach_needed",
      priority: "high",
      status: "pending",
      context: {
        paymentAmount: 12500,
        paymentId: String(paymentId),
        paidAt: now,
        sandbox: true,
        memberName: payingName,
        matchPartnerName: partnerName,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      matchId,
      paymentId,
      actionItemId,
      payingMember: payingName,
      matchPartner: partnerName,
    };
  },
});

// ============================================================================
// cleanupSandbox — Remove all sandbox action items, matches, payments
// ============================================================================

export const cleanupSandbox = mutation({
  args: {},
  handler: async (ctx) => {
    let deleted = 0;

    // Delete sandbox action items
    const items = await ctx.db.query("actionQueue").collect();
    for (const item of items) {
      if (item.context?.sandbox) {
        await ctx.db.delete(item._id);
        deleted++;
      }
    }

    // Delete sandbox matches
    const matches = await ctx.db.query("matches").collect();
    for (const match of matches) {
      if (typeof match.smaIntroId === "string" && match.smaIntroId.startsWith("sandbox-")) {
        // Also delete associated payments
        const payments = await ctx.db
          .query("payments")
          .withIndex("by_match", (q) => q.eq("matchId", match._id))
          .collect();
        for (const p of payments) {
          await ctx.db.delete(p._id);
          deleted++;
        }
        await ctx.db.delete(match._id);
        deleted++;
      }
    }

    // Delete sandbox flow instances
    const instances = await ctx.db.query("flowInstances").collect();
    for (const inst of instances) {
      const ctx2 = inst.context as any;
      if (ctx2?.metadata?.sandbox) {
        await ctx.db.delete(inst._id);
        deleted++;
      }
    }

    return { deleted };
  },
});
