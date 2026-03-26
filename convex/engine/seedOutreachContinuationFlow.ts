// @ts-nocheck
/**
 * Seed the Outreach Continuation Flow definition.
 * Run once: npx convex run engine/seedOutreachContinuationFlow:seedOutreachContinuationFlow
 */

import { mutation } from "../_generated/server";
import {
  FLOW_NAME,
  FLOW_TYPE,
  FLOW_DESCRIPTION,
  nodes,
  edges,
} from "./outreachContinuationFlowData";

export const seedOutreachContinuationFlow = mutation({
  handler: async (ctx) => {
    // Check if already exists
    const existing = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_type", (q) => q.eq("type", FLOW_TYPE))
      .first();

    if (existing) {
      // Update existing
      await ctx.db.patch(existing._id, {
        name: FLOW_NAME,
        description: FLOW_DESCRIPTION,
        nodes,
        edges,
        version: existing.version + 1,
        isActive: true,
        updatedAt: Date.now(),
      });
      console.log(`[seed] Updated ${FLOW_NAME} (v${existing.version + 1})`);
      return { flowDefinitionId: existing._id, action: "updated" };
    }

    // Create new
    const id = await ctx.db.insert("flowDefinitions", {
      name: FLOW_NAME,
      type: FLOW_TYPE,
      description: FLOW_DESCRIPTION,
      nodes,
      edges,
      version: 1,
      isActive: true,
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    console.log(`[seed] Created ${FLOW_NAME} (${id})`);
    return { flowDefinitionId: id, action: "created" };
  },
});
