import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./auth/authz";

const DEFAULTS = {
  profileExpirationHours: 24,
  autoSyncCallsToCrm: true,
  dataRequestExpirationHours: 72,
  dataRequestAutoSendEnabled: false,
  dataRequestAutoSendDelayDays: 3,
  dataRequestAllowResubmit: true,
  summaryPrompt: "",
};

export const get = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const doc = await ctx.db.query("appSettings").first();
    return doc ?? {
      profileExpirationHours: DEFAULTS.profileExpirationHours,
      autoSyncCallsToCrm: DEFAULTS.autoSyncCallsToCrm,
      dataRequestExpirationHours: DEFAULTS.dataRequestExpirationHours,
      dataRequestAutoSendEnabled: DEFAULTS.dataRequestAutoSendEnabled,
      dataRequestAutoSendDelayDays: DEFAULTS.dataRequestAutoSendDelayDays,
      dataRequestAllowResubmit: DEFAULTS.dataRequestAllowResubmit,
      summaryPrompt: DEFAULTS.summaryPrompt,
    };
  },
});

export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    profileExpirationHours: v.optional(v.number()),
    autoSyncCallsToCrm: v.optional(v.boolean()),
    dataRequestExpirationHours: v.optional(v.number()),
    dataRequestAutoSendEnabled: v.optional(v.boolean()),
    dataRequestAutoSendDelayDays: v.optional(v.number()),
    dataRequestAllowResubmit: v.optional(v.boolean()),
    summaryPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const existing = await ctx.db.query("appSettings").first();
    const now = Date.now();

    const updates: Record<string, unknown> = { updatedAt: now };
    if (args.profileExpirationHours !== undefined) {
      updates.profileExpirationHours = args.profileExpirationHours;
    }
    if (args.autoSyncCallsToCrm !== undefined) {
      updates.autoSyncCallsToCrm = args.autoSyncCallsToCrm;
    }
    if (args.dataRequestExpirationHours !== undefined) {
      updates.dataRequestExpirationHours = args.dataRequestExpirationHours;
    }
    if (args.dataRequestAutoSendEnabled !== undefined) {
      updates.dataRequestAutoSendEnabled = args.dataRequestAutoSendEnabled;
    }
    if (args.dataRequestAutoSendDelayDays !== undefined) {
      updates.dataRequestAutoSendDelayDays = args.dataRequestAutoSendDelayDays;
    }
    if (args.dataRequestAllowResubmit !== undefined) {
      updates.dataRequestAllowResubmit = args.dataRequestAllowResubmit;
    }
    if (args.summaryPrompt !== undefined) {
      updates.summaryPrompt = args.summaryPrompt;
    }

    if (existing) {
      await ctx.db.patch(existing._id, updates);
    } else {
      await ctx.db.insert("appSettings", {
        profileExpirationHours: args.profileExpirationHours ?? DEFAULTS.profileExpirationHours,
        autoSyncCallsToCrm: args.autoSyncCallsToCrm ?? DEFAULTS.autoSyncCallsToCrm,
        dataRequestExpirationHours: args.dataRequestExpirationHours ?? DEFAULTS.dataRequestExpirationHours,
        dataRequestAutoSendEnabled: args.dataRequestAutoSendEnabled ?? DEFAULTS.dataRequestAutoSendEnabled,
        dataRequestAutoSendDelayDays: args.dataRequestAutoSendDelayDays ?? DEFAULTS.dataRequestAutoSendDelayDays,
        dataRequestAllowResubmit: args.dataRequestAllowResubmit ?? DEFAULTS.dataRequestAllowResubmit,
        summaryPrompt: args.summaryPrompt ?? DEFAULTS.summaryPrompt,
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

export const getAutoSyncCallsToCrm = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("appSettings").first();
    return doc?.autoSyncCallsToCrm ?? DEFAULTS.autoSyncCallsToCrm;
  },
});

export const getSummaryPrompt = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db.query("appSettings").first();
    return doc?.summaryPrompt || "";
  },
});
