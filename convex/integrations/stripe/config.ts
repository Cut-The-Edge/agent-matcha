// @ts-nocheck
/**
 * Stripe Configuration
 *
 * Sets up the @convex-dev/stripe component client.
 */

import { StripeSubscriptions } from "@convex-dev/stripe";
import { components } from "../../_generated/api";

/**
 * Create a Stripe client instance for use inside Convex actions.
 */
export function createStripeClient() {
  return new StripeSubscriptions(components.stripe, {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  });
}
