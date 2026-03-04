// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authz";

/**
 * Create a new member.
 * Required: firstName, phone, smaId.
 * Optional: lastName, email, whatsappId, tier, matchmakerNotes, profileComplete.
 * Auto-sets createdAt, updatedAt, status="active", rejectionCount=0, lastSyncedAt.
 */
export const create = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    smaId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    profileLink: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();

    const memberId = await ctx.db.insert("members", {
      smaId: args.smaId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      whatsappId: args.whatsappId,
      profileLink: args.profileLink,
      tier: args.tier ?? "free",
      profileComplete: args.profileComplete ?? false,
      matchmakerNotes: args.matchmakerNotes,
      rejectionCount: 0,
      status: "active",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return memberId;
  },
});

/**
 * Update member fields by ID.
 * Partial update: only provided fields get changed.
 * Always updates updatedAt.
 */
export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    profileLink: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.firstName !== undefined) updates.firstName = args.firstName;
    if (args.lastName !== undefined) updates.lastName = args.lastName;
    if (args.email !== undefined) updates.email = args.email;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.whatsappId !== undefined) updates.whatsappId = args.whatsappId;
    if (args.profileLink !== undefined) updates.profileLink = args.profileLink;
    if (args.tier !== undefined) updates.tier = args.tier;
    if (args.profileComplete !== undefined) updates.profileComplete = args.profileComplete;
    if (args.matchmakerNotes !== undefined) updates.matchmakerNotes = args.matchmakerNotes;

    await ctx.db.patch(args.memberId, updates);
    return args.memberId;
  },
});

/**
 * Change member status (active/paused/recalibrating).
 */
export const updateStatus = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("recalibrating")
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    await ctx.db.patch(args.memberId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return args.memberId;
  },
});

/**
 * Reactivate a recalibrating member: sets status back to "active" and resets rejectionCount to 0.
 */
export const reactivate = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    await ctx.db.patch(args.memberId, {
      status: "active",
      rejectionCount: 0,
      updatedAt: Date.now(),
    });

    return args.memberId;
  },
});

/**
 * Increment rejectionCount for a member.
 * If rejectionCount reaches >= 3, automatically set status to "recalibrating".
 * Internal mutation — called by match processing logic, not directly by the frontend.
 */
export const incrementRejectionCount = internalMutation({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    const newCount = existing.rejectionCount + 1;
    const updates: Record<string, any> = {
      rejectionCount: newCount,
      updatedAt: Date.now(),
    };

    if (newCount >= 3) {
      updates.status = "recalibrating";
    }

    await ctx.db.patch(args.memberId, updates);

    // Schedule async LLM analysis of all rejection conversations
    if (newCount >= 3) {
      await ctx.scheduler.runAfter(0, internal.integrations.openrouter.analyze.analyzeRecalibration, {
        memberId: args.memberId,
      });
    }

    return { memberId: args.memberId, rejectionCount: newCount, recalibrating: newCount >= 3 };
  },
});

/**
 * Upsert a member by smaId (sync from SmartMatchApp).
 * If a member with the given smaId exists, update their fields + lastSyncedAt.
 * If not, create a new member record.
 */
export const syncFromSma = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    smaId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();

    // Look up existing member by smaId
    const existing = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaId))
      .first();

    if (existing) {
      // Update existing member
      const updates: Record<string, any> = {
        lastSyncedAt: now,
        updatedAt: now,
      };

      if (args.firstName !== undefined) updates.firstName = args.firstName;
      if (args.lastName !== undefined) updates.lastName = args.lastName;
      if (args.email !== undefined) updates.email = args.email;
      if (args.phone !== undefined) updates.phone = args.phone;
      if (args.whatsappId !== undefined) updates.whatsappId = args.whatsappId;
      if (args.tier !== undefined) updates.tier = args.tier;
      if (args.profileComplete !== undefined) updates.profileComplete = args.profileComplete;
      if (args.matchmakerNotes !== undefined) updates.matchmakerNotes = args.matchmakerNotes;

      await ctx.db.patch(existing._id, updates);
      return { memberId: existing._id, action: "updated" as const };
    } else {
      // Create new member
      const memberId = await ctx.db.insert("members", {
        smaId: args.smaId,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        phone: args.phone,
        whatsappId: args.whatsappId,
        tier: args.tier ?? "free",
        profileComplete: args.profileComplete ?? false,
        matchmakerNotes: args.matchmakerNotes,
        rejectionCount: 0,
        status: "active",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { memberId, action: "created" as const };
    }
  },
});

/**
 * Soft-delete a member by setting status to "paused".
 * (Schema only supports active/paused/recalibrating, so we use "paused" as the soft-delete state.)
 */
export const deleteMember = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    await ctx.db.patch(args.memberId, {
      status: "paused",
      updatedAt: Date.now(),
    });

    return args.memberId;
  },
});

/**
 * Store the LLM-generated recalibration summary on a member record.
 * Called by the analyzeRecalibration action after OpenRouter responds.
 */
export const updateRecalibrationSummary = internalMutation({
  args: {
    memberId: v.id("members"),
    recalibrationSummary: v.object({
      summary: v.string(),
      keyPatterns: v.array(v.string()),
      analyzedAt: v.number(),
      feedbackCount: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memberId, {
      recalibrationSummary: args.recalibrationSummary,
      updatedAt: Date.now(),
    });
  },
});
