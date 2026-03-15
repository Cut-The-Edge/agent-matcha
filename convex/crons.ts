import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "recover orphaned calls",
  { hours: 1 },
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

export default crons;
