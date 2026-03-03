import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import twilio from "@convex-dev/twilio/convex.config";
import stripe from "@convex-dev/stripe/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import actionRetrier from "@convex-dev/action-retrier/convex.config";
import crons from "@convex-dev/crons/convex.config";
import aggregate from "@convex-dev/aggregate/convex.config";
import shardedCounter from "@convex-dev/sharded-counter/convex.config";

const app = defineApp();
app.use(agent);
app.use(workflow);
app.use(twilio);
app.use(stripe);
app.use(rateLimiter);
app.use(actionRetrier);
app.use(crons);
app.use(aggregate);
app.use(shardedCounter);

export default app;
