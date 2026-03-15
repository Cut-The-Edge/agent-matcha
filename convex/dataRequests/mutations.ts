// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";
import { getMissingFields } from "./helpers";

export const createAndSend = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new Error("Member not found");
    if (!member.phone) throw new Error("Member has no phone number");

    const settings = await ctx.db.query("appSettings").first();
    const expirationHours = settings?.dataRequestExpirationHours ?? 72;

    const now = Date.now();
    const token = crypto.randomUUID();
    const missingFields = getMissingFields(member);

    const requestId = await ctx.db.insert("dataRequests", {
      memberId: args.memberId,
      token,
      status: "pending",
      sentBy: "manual",
      sentByAdminId: admin._id,
      expiresAt: now + expirationHours * 60 * 60 * 1000,
      missingFieldsAtSend: missingFields,
      sentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule WhatsApp message send
    await ctx.scheduler.runAfter(0, internal.dataRequests.actions.sendDataRequestMessage, {
      requestId,
      memberId: args.memberId,
      token,
    });

    return { requestId, token };
  },
});

export const createBulkSend = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberIds: v.array(v.id("members")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);
    const settings = await ctx.db.query("appSettings").first();
    const expirationHours = settings?.dataRequestExpirationHours ?? 72;
    const now = Date.now();

    let sent = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const memberId of args.memberIds) {
      const member = await ctx.db.get(memberId);
      if (!member) {
        errors.push(`Member ${memberId} not found`);
        continue;
      }
      if (!member.phone) {
        skipped++;
        continue;
      }

      // Check for existing pending request
      const existing = await ctx.db
        .query("dataRequests")
        .withIndex("by_member", (q) => q.eq("memberId", memberId))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      const token = crypto.randomUUID();
      const missingFields = getMissingFields(member);

      const requestId = await ctx.db.insert("dataRequests", {
        memberId,
        token,
        status: "pending",
        sentBy: "bulk",
        sentByAdminId: admin._id,
        expiresAt: now + expirationHours * 60 * 60 * 1000,
        missingFieldsAtSend: missingFields,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.scheduler.runAfter(0, internal.dataRequests.actions.sendDataRequestMessage, {
        requestId,
        memberId,
        token,
      });

      sent++;
    }

    return { sent, skipped, errors };
  },
});

export const sendToAllMissing = mutation({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);
    const settings = await ctx.db.query("appSettings").first();
    const expirationHours = settings?.dataRequestExpirationHours ?? 72;
    const now = Date.now();

    const allMembers = await ctx.db.query("members").collect();
    let sent = 0;
    let skipped = 0;

    for (const member of allMembers) {
      const missing = getMissingFields(member);
      if (missing.length === 0 || !member.phone) {
        skipped++;
        continue;
      }

      // Skip if already has a pending or completed request
      const existing = await ctx.db
        .query("dataRequests")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .filter((q) =>
          q.or(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("status"), "completed")
          )
        )
        .first();

      if (existing) {
        skipped++;
        continue;
      }

      const token = crypto.randomUUID();
      const requestId = await ctx.db.insert("dataRequests", {
        memberId: member._id,
        token,
        status: "pending",
        sentBy: "bulk",
        sentByAdminId: admin._id,
        expiresAt: now + expirationHours * 60 * 60 * 1000,
        missingFieldsAtSend: missing,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.scheduler.runAfter(0, internal.dataRequests.actions.sendDataRequestMessage, {
        requestId,
        memberId: member._id,
        token,
      });

      sent++;
    }

    return { sent, skipped };
  },
});

export const submitForm = mutation({
  args: {
    token: v.string(),
    email: v.optional(v.string()),
    location: v.optional(v.object({
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      country: v.optional(v.string()),
    })),
    profilePictureStorageId: v.optional(v.string()),
    instagram: v.optional(v.string()),
    tiktok: v.optional(v.string()),
    linkedin: v.optional(v.string()),
    referralSource: v.optional(v.array(v.string())),
    inviteCode: v.optional(v.string()),
    closeStoriesConsent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("dataRequests")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!request) throw new Error("Invalid form link");
    if (request.status === "completed") throw new Error("Form already submitted");
    if (request.status === "expired" || request.expiresAt < Date.now()) {
      throw new Error("Form link has expired");
    }

    const member = await ctx.db.get(request.memberId);
    if (!member) throw new Error("Member not found");

    const now = Date.now();
    const memberUpdates: Record<string, any> = { updatedAt: now };
    const profileData = { ...(member.profileData as Record<string, any> ?? {}) };

    // Only overwrite non-empty fields
    if (args.email) memberUpdates.email = args.email;
    if (args.location?.city || args.location?.state || args.location?.country) {
      memberUpdates.location = {
        ...(member.location ?? {}),
        ...(args.location.city ? { city: args.location.city } : {}),
        ...(args.location.state ? { state: args.location.state } : {}),
        ...(args.location.country ? { country: args.location.country } : {}),
      };
    }
    if (args.profilePictureStorageId) {
      const url = await ctx.storage.getUrl(args.profilePictureStorageId);
      if (url) memberUpdates.profilePictureUrl = url;
    }
    if (args.instagram) profileData.instagram = args.instagram;
    if (args.tiktok) profileData.tiktok = args.tiktok;
    if (args.linkedin) profileData.linkedin = args.linkedin;
    if (args.referralSource && args.referralSource.length > 0) {
      profileData.referralSource = args.referralSource;
    }
    if (args.inviteCode) profileData.inviteCode = args.inviteCode;
    if (args.closeStoriesConsent !== undefined) {
      profileData.closeStoriesConsent = args.closeStoriesConsent;
    }

    memberUpdates.profileData = profileData;

    // Update member record
    await ctx.db.patch(request.memberId, memberUpdates);

    // Snapshot submitted data
    const submittedData = { ...args };
    delete (submittedData as any).token;

    // Update request status
    await ctx.db.patch(request._id, {
      status: "completed",
      completedAt: now,
      submittedData,
      updatedAt: now,
    });

    // Schedule SMA sync (async so member sees success immediately)
    await ctx.scheduler.runAfter(0, internal.dataRequests.actions.syncSubmittedDataToSma, {
      memberId: request.memberId,
      submittedData,
    });

    return { success: true };
  },
});

export const expireOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const pending = await ctx.db
      .query("dataRequests")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    let expired = 0;
    for (const request of pending) {
      if (request.expiresAt < now) {
        await ctx.db.patch(request._id, {
          status: "expired",
          updatedAt: now,
        });
        expired++;
      }
    }

    if (expired > 0) {
      console.log(`[dataRequests] Expired ${expired} overdue requests`);
    }
  },
});
