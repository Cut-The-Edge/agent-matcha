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

export default crons;
