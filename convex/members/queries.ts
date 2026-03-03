// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * List all members with optional filters
 */
export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("paused"),
        v.literal("recalibrating"),
      )
    ),
    tier: v.optional(
      v.union(
        v.literal("free"),
        v.literal("member"),
        v.literal("vip"),
      )
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    let membersQuery;

    if (args.status) {
      membersQuery = ctx.db
        .query("members")
        .withIndex("by_status", (q) => q.eq("status", args.status!));
    } else {
      membersQuery = ctx.db.query("members");
    }

    const members = await membersQuery.collect();

    // Apply tier filter in memory if provided
    if (args.tier) {
      return members.filter((m) => m.tier === args.tier);
    }

    return members;
  },
});

/**
 * Get a single member by ID
 */
export const get = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db.get(args.memberId);
  },
});

/**
 * Get a member by their SmartMatchApp ID
 */
export const getBySmaId = query({
  args: {
    sessionToken: v.optional(v.string()),
    smaId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    return await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaId))
      .first();
  },
});
