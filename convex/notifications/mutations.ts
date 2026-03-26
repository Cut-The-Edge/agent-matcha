// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

// ── Create notification (internal — called by other mutations) ───────

export const createNotification = internalMutation({
  args: {
    type: v.union(
      v.literal("escalation"),
      v.literal("lead"),
      v.literal("flow_action"),
      v.literal("system"),
      v.literal("action_queue"),
    ),
    title: v.string(),
    message: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("urgent"),
    ),
    actionUrl: v.optional(v.string()),
    relatedEntityType: v.optional(
      v.union(
        v.literal("escalation"),
        v.literal("membershipLead"),
        v.literal("flowInstance"),
        v.literal("phoneCall"),
        v.literal("actionItem"),
      )
    ),
    relatedEntityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("notifications", {
      type: args.type,
      title: args.title,
      message: args.message,
      severity: args.severity,
      read: false,
      actionUrl: args.actionUrl,
      relatedEntityType: args.relatedEntityType,
      relatedEntityId: args.relatedEntityId,
      createdAt: Date.now(),
    });
    return id;
  },
});

// ── Mark single notification as read ─────────────────────────────────

export const markRead = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");
    await ctx.db.patch(args.notificationId, { read: true });
    return { success: true };
  },
});

// ── Mark all notifications as read ───────────────────────────────────

export const markAllRead = mutation({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_read", (q) => q.eq("read", false))
      .take(200);

    for (const notification of unread) {
      await ctx.db.patch(notification._id, { read: true });
    }
    return { updated: unread.length };
  },
});

// ── Delete old notifications (internal — for cron cleanup) ───────────

export const deleteOld = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Delete notifications older than 30 days
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("notifications")
      .withIndex("by_created")
      .filter((q) => q.lt(q.field("createdAt"), cutoff))
      .take(200);

    for (const notification of old) {
      await ctx.db.delete(notification._id);
    }
    return { deleted: old.length };
  },
});
