// @ts-nocheck
/**
 * Action Queue Cron Handlers
 *
 * Two cron-triggered mutations:
 * - bumpAgingItems: Pending items > 48h → bump to urgent + re-notify
 * - expireStaleItems: Pending items > 7 days → auto-expire + notify
 */

import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

const FORTY_EIGHT_HOURS = 48 * 60 * 60 * 1000;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// ============================================================================
// bumpAgingItems — Pending items > 48h: bump priority + re-notify
// ============================================================================

export const bumpAgingItems = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - FORTY_EIGHT_HOURS;

    const [pendingItems, inProgressItems] = await Promise.all([
      ctx.db.query("actionQueue").withIndex("by_status", (q) => q.eq("status", "pending")).collect(),
      ctx.db.query("actionQueue").withIndex("by_status", (q) => q.eq("status", "in_progress")).collect(),
    ]);

    const allActive = [...pendingItems, ...inProgressItems];
    const aging = allActive.filter(
      (item) => item.createdAt < cutoff && item.priority !== "urgent"
    );

    let bumped = 0;
    for (const item of aging.slice(0, 50)) {
      await ctx.db.patch(item._id, {
        priority: "urgent",
        updatedAt: Date.now(),
      });

      // Schedule WhatsApp re-notification to Dani
      await ctx.scheduler.runAfter(
        0,
        internal.actionQueue.notify.notifyAging,
        { actionItemId: item._id }
      );

      // Create dashboard notification
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.mutations.createNotification,
        {
          type: "action_queue" as const,
          title: "Action item aging",
          message: `An action item has been pending for over 48 hours and was bumped to urgent.`,
          severity: "warning",
          actionUrl: "/dashboard/actions",
          relatedEntityType: "actionItem" as const,
          relatedEntityId: String(item._id),
        }
      );

      bumped++;
    }

    if (bumped > 0) {
      console.log(`[action-queue-cron] Bumped ${bumped} aging items to urgent`);
    }
  },
});

// ============================================================================
// expireStaleItems — Pending items > 7 days: auto-expire + notify
// ============================================================================

export const expireStaleItems = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - SEVEN_DAYS;

    const pendingItems = await ctx.db
      .query("actionQueue")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const stale = pendingItems.filter((item) => item.createdAt < cutoff);

    let expired = 0;
    for (const item of stale.slice(0, 50)) {
      await ctx.db.patch(item._id, {
        status: "expired",
        resolvedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Create dashboard notification
      await ctx.scheduler.runAfter(
        0,
        internal.notifications.mutations.createNotification,
        {
          type: "action_queue" as const,
          title: "Action item expired",
          message: `An action item expired after 7 days without resolution.`,
          severity: "urgent",
          actionUrl: "/dashboard/actions",
          relatedEntityType: "actionItem" as const,
          relatedEntityId: String(item._id),
        }
      );

      expired++;
    }

    if (expired > 0) {
      console.log(`[action-queue-cron] Expired ${expired} stale items`);
    }
  },
});

// ============================================================================
// checkFollowUpReminders — Items with follow-up dates that have passed
// ============================================================================

export const checkFollowUpReminders = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();

    // Get in_progress items that have a follow-up date
    const inProgressItems = await ctx.db
      .query("actionQueue")
      .withIndex("by_status", (q) => q.eq("status", "in_progress"))
      .collect();

    const dueItems = inProgressItems.filter(
      (item) => item.followUpDate && item.followUpDate <= now
    );

    let reminded = 0;
    for (const item of dueItems.slice(0, 50)) {
      // Bump priority if not already urgent
      if (item.priority !== "urgent") {
        await ctx.db.patch(item._id, {
          priority: "high",
          updatedAt: now,
        });
      }

      // Send reminder notification
      await ctx.scheduler.runAfter(
        0,
        internal.actionQueue.notify.notifyAging,
        { actionItemId: item._id }
      );

      await ctx.scheduler.runAfter(
        0,
        internal.notifications.mutations.createNotification,
        {
          type: "action_queue" as const,
          title: "Follow-up reminder",
          message: `A follow-up is due for an action item.`,
          severity: "warning",
          actionUrl: "/dashboard/actions",
          relatedEntityType: "actionItem" as const,
          relatedEntityId: String(item._id),
        }
      );

      // Clear the follow-up date so we don't re-remind
      await ctx.db.patch(item._id, {
        followUpDate: undefined,
        updatedAt: now,
      });

      reminded++;
    }

    if (reminded > 0) {
      console.log(`[action-queue-cron] Sent ${reminded} follow-up reminders`);
    }
  },
});
