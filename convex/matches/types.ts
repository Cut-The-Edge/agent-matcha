// @ts-nocheck
import { v } from "convex/values";

/**
 * Shared validators for match-related types.
 */

export const matchStatusValidator = v.union(
  v.literal("pending"),
  v.literal("sent_a"),
  v.literal("sent_b"),
  v.literal("a_interested"),
  v.literal("b_interested"),
  v.literal("mutual_interest"),
  v.literal("group_created"),
  v.literal("a_declined"),
  v.literal("b_declined"),
  v.literal("a_passed"),
  v.literal("b_passed"),
  v.literal("personal_outreach_a"),
  v.literal("personal_outreach_b"),
  v.literal("completed"),
  v.literal("expired")
);

export type MatchStatus =
  | "pending"
  | "sent_a"
  | "sent_b"
  | "a_interested"
  | "b_interested"
  | "mutual_interest"
  | "group_created"
  | "a_declined"
  | "b_declined"
  | "a_passed"
  | "b_passed"
  | "personal_outreach_a"
  | "personal_outreach_b"
  | "completed"
  | "expired";

/** Statuses where the match can no longer be advanced normally. */
export const TERMINAL_STATUSES: Set<MatchStatus> = new Set([
  "completed",
  "expired",
  "a_declined",
  "b_declined",
]);

/** Statuses indicating at least one party has responded. */
export const RESPONDED_STATUSES: Set<MatchStatus> = new Set([
  "a_interested",
  "b_interested",
  "mutual_interest",
  "group_created",
  "a_declined",
  "b_declined",
  "a_passed",
  "b_passed",
  "personal_outreach_a",
  "personal_outreach_b",
  "completed",
]);
