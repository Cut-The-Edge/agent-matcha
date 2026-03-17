// @ts-nocheck
/**
 * Stripe Checkout Session Creation
 *
 * Creates Stripe Checkout Sessions for the Personal Outreach product ($125).
 * After creating the session, sends the checkout URL to the member via WhatsApp.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { createStripeClient } from "./config";

/**
 * Create a Stripe Checkout Session and send the payment link to the member.
 *
 * Called by the flow engine executor when a create_stripe_link action node fires.
 * This is an internalAction because it calls the external Stripe API.
 */
export const createCheckoutAndNotify = internalAction({
  args: {
    paymentId: v.id("payments"),
    flowInstanceId: v.id("flowInstances"),
    memberId: v.id("members"),
    matchId: v.id("matches"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const stripe = createStripeClient();

    const baseUrl = process.env.APP_URL || "https://agent-matcha.vercel.app";

    // Look up member details for tracking + WhatsApp delivery
    const member = await ctx.runQuery(
      internal.integrations.twilio.lookups.findMemberById,
      { memberId: args.memberId }
    );

    const memberPhone = member?.whatsappId || member?.phone || "";
    const memberName = [member?.firstName, member?.lastName].filter(Boolean).join(" ") || "Unknown";

    // Create Stripe Checkout Session with full tracking metadata
    const { sessionId, url } = await stripe.createCheckoutSession(ctx, {
      priceId: process.env.STRIPE_PERSONAL_OUTREACH_PRICE_ID!,
      mode: "payment",
      successUrl: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/payment/cancel`,
      metadata: {
        flowInstanceId: args.flowInstanceId,
        matchId: args.matchId,
        memberId: args.memberId,
        paymentId: args.paymentId,
        memberPhone,
        memberName,
        type: "personal_outreach",
      },
    });

    console.log(
      `[stripe] Checkout session created: ${sessionId} for member ${memberName} (${memberPhone})`
    );

    // Update payment record with Stripe session ID
    await ctx.runMutation(
      internal.integrations.stripe.callbacks.updatePaymentWithSession,
      {
        paymentId: args.paymentId,
        stripeSessionId: sessionId,
      }
    );

    // Send payment link to member via WhatsApp
    if (url && member) {
      const phone = member.whatsappId || member.phone;
      if (phone) {
        await ctx.runAction(
          internal.integrations.twilio.whatsapp.sendTextMessage,
          {
            to: phone,
            body: `To get started, please complete the first $${(args.amount / 100).toFixed(2)} payment here:\n\n${url}`,
          }
        );
      }
    }

    return { sessionId, url };
  },
});
