// @ts-nocheck
/**
 * Stripe Webhook Handler
 *
 * Processes Stripe webhook events, specifically checkout.session.completed,
 * to confirm payments and advance flow instances.
 *
 * Uses the @convex-dev/stripe component's built-in route registration
 * with custom event handlers.
 */

import { internal } from "../../_generated/api";
import { createStripeClient } from "./config";

/**
 * Custom event handlers for Stripe webhooks.
 * These are passed to stripe.registerRoutes() in http.ts.
 */
export const stripeEventHandlers = {
  "checkout.session.completed": async (ctx: any, event: any) => {
    const session = event.data.object;
    const sessionId = session.id;
    const paymentIntentId = session.payment_intent;

    // Update payment and advance flow
    await ctx.runMutation(
      internal.integrations.stripe.callbacks.handleCheckoutCompleted,
      {
        stripeSessionId: sessionId,
        stripePaymentIntentId: paymentIntentId || undefined,
      }
    );
  },
};
