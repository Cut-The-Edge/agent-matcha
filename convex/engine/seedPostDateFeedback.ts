// @ts-nocheck
/**
 * Seed the Post-Date Feedback Flow definition.
 *
 * Idempotent: checks for existing post_date_feedback flows before inserting.
 * Run via Convex dashboard or CLI:
 *   npx convex run engine/seedPostDateFeedback:seedPostDateFeedbackFlow
 */

import { internalMutation } from "../_generated/server";
import {
  FLOW_NAME,
  FLOW_TYPE,
  FLOW_DESCRIPTION,
  nodes,
  edges,
} from "./postDateFeedbackFlowData";

export const seedPostDateFeedbackFlow = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if a post_date_feedback flow already exists
    const existing = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_type", (q) => q.eq("type", FLOW_TYPE))
      .first();

    if (existing) {
      return { alreadyExists: true, flowDefinitionId: existing._id };
    }

    const now = Date.now();

    const flowDefinitionId = await ctx.db.insert("flowDefinitions", {
      name: FLOW_NAME,
      type: FLOW_TYPE,
      description: FLOW_DESCRIPTION,
      nodes,
      edges,
      version: 1,
      isActive: true,
      isDefault: true,
      createdBy: "system_seed",
      createdAt: now,
      updatedAt: now,
    });

    return { alreadyExists: false, flowDefinitionId };
  },
});
