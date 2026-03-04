// @ts-nocheck
import { httpRouter } from "convex/server";
import { twilioWebhookHandler } from "./integrations/twilio/webhooks";
import { crmMatchCreatedHandler } from "./integrations/crm/webhooks";
import { registerRoutes as registerStripeRoutes } from "@convex-dev/stripe";
import { stripeEventHandlers } from "./integrations/stripe/webhooks";
import { components } from "./_generated/api";
import {
  callStartedHandler,
  callEndedHandler,
  transcriptSegmentHandler,
  saveIntakeDataHandler,
  lookupMemberHandler,
  escalateHandler,
} from "./voice/http";

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

// ── Voice agent HTTP endpoints ───────────────────────────────────
http.route({ path: "/voice/call-started", method: "POST", handler: callStartedHandler });
http.route({ path: "/voice/call-ended", method: "POST", handler: callEndedHandler });
http.route({ path: "/voice/transcript-segment", method: "POST", handler: transcriptSegmentHandler });
http.route({ path: "/voice/save-intake-data", method: "POST", handler: saveIntakeDataHandler });
http.route({ path: "/voice/lookup-member", method: "POST", handler: lookupMemberHandler });
http.route({ path: "/voice/escalate", method: "POST", handler: escalateHandler });

// ── Stripe webhook (uses @convex-dev/stripe built-in registration) ─
registerStripeRoutes(http, components.stripe, {
  events: stripeEventHandlers,
});

export default http;
