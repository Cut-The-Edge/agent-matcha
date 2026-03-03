// @ts-nocheck
import { v } from "convex/values";

/**
 * Shared validators for member-related types.
 */

export const memberStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("recalibrating")
);

export const memberTierValidator = v.union(
  v.literal("free"),
  v.literal("member"),
  v.literal("vip")
);

export type MemberStatus = "active" | "paused" | "recalibrating";
export type MemberTier = "free" | "member" | "vip";
