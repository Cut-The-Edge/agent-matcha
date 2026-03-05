import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./auth/authz";

const DEFAULTS = {
  profileExpirationHours: 24,
};

export const get = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const doc = await ctx.db.query("appSettings").first();
    return doc ?? { profileExpirationHours: DEFAULTS.profileExpirationHours };
  },
});

export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    profileExpirationHours: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const existing = await ctx.db.query("appSettings").first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        profileExpirationHours: args.profileExpirationHours,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("appSettings", {
        profileExpirationHours: args.profileExpirationHours,
        updatedAt: now,
      });
    }
  },
});

export const getProfileExpirationHours = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("appSettings").first();
    return doc?.profileExpirationHours ?? DEFAULTS.profileExpirationHours;
  },
});
