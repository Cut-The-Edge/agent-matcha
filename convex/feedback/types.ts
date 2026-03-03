// @ts-nocheck
import { v } from "convex/values";

/**
 * Shared validators for feedback-related types.
 */

export const feedbackDecisionValidator = v.union(
  v.literal("interested"),
  v.literal("not_interested"),
  v.literal("passed")
);

export const feedbackCategoryValidator = v.union(
  v.literal("physical_attraction"),
  v.literal("photos_only"),
  v.literal("chemistry"),
  v.literal("willingness_to_meet"),
  v.literal("age_preference"),
  v.literal("location"),
  v.literal("career_income"),
  v.literal("something_specific")
);

export type FeedbackDecision = "interested" | "not_interested" | "passed";

export type FeedbackCategory =
  | "physical_attraction"
  | "photos_only"
  | "chemistry"
  | "willingness_to_meet"
  | "age_preference"
  | "location"
  | "career_income"
  | "something_specific";
