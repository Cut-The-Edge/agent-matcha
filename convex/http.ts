import { httpRouter } from "convex/server";

const http = httpRouter();

// TODO: Twilio webhook routes
// http.route({
//   path: "/twilio/webhook",
//   method: "POST",
//   handler: twilioWebhookHandler,
// });

// TODO: Stripe webhook routes
// http.route({
//   path: "/stripe/webhook",
//   method: "POST",
//   handler: stripeWebhookHandler,
// });

export default http;
