// @ts-nocheck
import { v } from "convex/values";

/**
 * Shared validators for match-related types.
 * Based on spec §7.1 Match Status Values.
 */

export const matchStatusValidator = v.union(
  v.literal("active"),     // Active Introductions — sent, awaiting response
  v.literal("rejected"),   // Rejected Introductions — member explicitly declined (Flow B)
  v.literal("past"),       // Past Introductions — passed after upsell decline (Flow C → No)
  v.literal("pending"),    // Pending — upsell activated, awaiting outreach (Flow C → Yes)
  v.literal("completed"),
  v.literal("expired")
);

export type MatchStatus =
  | "active"
  | "rejected"
  | "past"
  | "pending"
  | "completed"
  | "expired";

/** Statuses where the match can no longer be advanced normally. */
export const TERMINAL_STATUSES: Set<MatchStatus> = new Set([
  "completed",
  "expired",
  "rejected",
  "past",
]);

/** Statuses indicating at least one party has responded. */
export const RESPONDED_STATUSES: Set<MatchStatus> = new Set([
  "rejected",
  "past",
  "pending",
  "completed",
]);
