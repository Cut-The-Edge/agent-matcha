// @ts-nocheck
/**
 * SmartMatchApp Integration Queries
 *
 * Internal queries for looking up SMA-related data.
 */

import { v } from "convex/values";
import { internalQuery } from "../../_generated/server";

/**
 * Fallback group ID map for Club Allenby SMA instance.
 * Used when no smaIntroductions records exist for a given group.
 * These should match the SMA admin's configured match groups.
 */
const FALLBACK_GROUP_IDS: Record<string, number> = {
  active: 1,
  past: 2,
  "not suitable": 3,
  potential: 4,
  rejected: 5,
  successful: 6,
  automated: 7,
};

/**
 * Find the SMA group ID by searching smaIntroductions for a record
 * whose group name contains the given keyword (e.g. "Rejected", "Past").
 *
 * Falls back to hardcoded group IDs if no matching records exist.
 * Returns { groupId, group } or null if not found.
 */
export const findGroupIdByName = internalQuery({
  args: { keyword: v.string() },
  handler: async (ctx, args) => {
    const lower = args.keyword.toLowerCase();

    // 1. Try to find from real data in smaIntroductions
    const intros = await ctx.db.query("smaIntroductions").take(200);

    for (const intro of intros) {
      if (intro.group && intro.group.toLowerCase().includes(lower)) {
        return { groupId: intro.groupId, group: intro.group };
      }
    }

    // 2. Fallback to hardcoded map
    for (const [key, id] of Object.entries(FALLBACK_GROUP_IDS)) {
      if (key.includes(lower) || lower.includes(key)) {
        return { groupId: id, group: key };
      }
    }

    return null;
  },
});
