import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "recover orphaned calls",
  { hours: 1 },
  internal.voice.recovery.recoverOrphanedCalls
);

export default crons;
