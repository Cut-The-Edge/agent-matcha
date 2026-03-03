// @ts-nocheck
/**
 * Stripe Callbacks
 *
 * Internal mutations called by Stripe actions/webhooks to update
 * payment records and advance flow instances.
 */

import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Update a payment record with the Stripe session ID after checkout creation.
 */
export const updatePaymentWithSession = internalMutation({
  args: {
    paymentId: v.id("payments"),
    stripeSessionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, {
      stripeSessionId: args.stripeSessionId,
    });
  },
});

/**
 * Handle a completed Stripe checkout session.
 * Updates payment status and advances the flow instance.
 */
export const handleCheckoutCompleted = internalMutation({
  args: {
    stripeSessionId: v.string(),
    stripePaymentIntentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Look up the payment by Stripe session ID
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_stripeSession", (q) =>
        q.eq("stripeSessionId", args.stripeSessionId)
      )
      .first();

    if (!payment) {
      console.warn(
        `Stripe webhook: no payment found for session ${args.stripeSessionId}`
      );
      return;
    }

    // Update payment status
    await ctx.db.patch(payment._id, {
      status: "paid",
      stripePaymentIntentId: args.stripePaymentIntentId,
    });

    // Find and advance the associated flow instance
    if (payment.flowInstanceId) {
      const instance = await ctx.db.get(payment.flowInstanceId);
      if (instance && instance.status === "active") {
        // Update context with payment confirmation
        const context = instance.context as any;
        const updatedContext = {
          ...context,
          paymentReceived: true,
          waitingForInput: false,
          waitingNodeId: undefined,
          metadata: {
            ...context.metadata,
            awaitingPayment: false,
            paymentCompletedAt: Date.now(),
            stripeSessionId: args.stripeSessionId,
          },
        };

        await ctx.db.patch(payment.flowInstanceId, {
          context: updatedContext,
          lastTransitionAt: Date.now(),
        });

        // Advance the flow past the payment-waiting step
        await ctx.scheduler.runAfter(
          0,
          internal.engine.interpreter.advanceFlow,
          {
            flowInstanceId: payment.flowInstanceId,
            input: "payment_completed",
          }
        );
      }
    }
  },
});
