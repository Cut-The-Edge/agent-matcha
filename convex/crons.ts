import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "recover orphaned calls",
  { minutes: 15 },
  internal.voice.recovery.recoverOrphanedCalls
);

crons.interval(
  "expire overdue membership leads",
  { hours: 2 },
  internal.membershipLeads.mutations.expireOverdue
);

crons.interval(
  "expire overdue data requests",
  { hours: 4 },
  internal.dataRequests.mutations.expireOverdue
);

crons.interval(
  "auto-send data request forms",
  { hours: 6 },
  internal.dataRequests.cron.checkAndAutoSend
);

crons.interval(
  "bump aging action items",
  { hours: 2 },
  internal.actionQueue.cron.bumpAgingItems
);

crons.interval(
  "expire stale action items",
  { hours: 6 },
  internal.actionQueue.cron.expireStaleItems
);

crons.interval(
  "check action queue follow-up reminders",
  { hours: 1 },
  internal.actionQueue.cron.checkFollowUpReminders
);

export default crons;
