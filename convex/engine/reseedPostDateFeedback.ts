// @ts-nocheck
/**
 * Re-seed (update) the Post-Date Feedback Flow definition.
 * Replaces nodes and edges on the existing flow.
 */

import { internalMutation } from "../_generated/server";
import {
  FLOW_NAME,
  FLOW_TYPE,
  FLOW_DESCRIPTION,
  nodes,
  edges,
} from "./postDateFeedbackFlowData";

export const reseedPostDateFeedbackFlow = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_type", (q) => q.eq("type", FLOW_TYPE))
      .first();

    if (!existing) {
      return { error: "No existing post_date_feedback flow found" };
    }

    await ctx.db.patch(existing._id, {
      name: FLOW_NAME,
      description: FLOW_DESCRIPTION,
      nodes,
      edges,
      version: (existing.version || 1) + 1,
      updatedAt: Date.now(),
    });

    return { updated: true, flowDefinitionId: existing._id, version: (existing.version || 1) + 1 };
  },
});
