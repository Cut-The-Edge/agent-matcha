// @ts-nocheck
import { httpRouter } from "convex/server";
import { twilioWebhookHandler } from "./integrations/twilio/webhooks";
import { crmMatchCreatedHandler } from "./integrations/crm/webhooks";
import { registerRoutes as registerStripeRoutes } from "@convex-dev/stripe";
import { stripeEventHandlers } from "./integrations/stripe/webhooks";
import { components } from "./_generated/api";

const http = httpRouter();

// ── Twilio inbound WhatsApp webhook ──────────────────────────────
http.route({
  path: "/twilio/webhook",
  method: "POST",
  handler: twilioWebhookHandler,
});

// ── CRM match-created webhook ────────────────────────────────────
http.route({
  path: "/crm/match-created",
  method: "POST",
  handler: crmMatchCreatedHandler,
});

// ── Stripe webhook (uses @convex-dev/stripe built-in registration) ─
registerStripeRoutes(http, components.stripe, {
  events: stripeEventHandlers,
});

export default http;
