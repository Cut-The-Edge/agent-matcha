// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

// ── List recent notifications (last 50) ──────────────────────────────

export const listRecent = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_created")
      .order("desc")
      .take(50);

    return notifications;
  },
});

// ── Count unread (for badge) ─────────────────────────────────────────

export const countUnread = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_read", (q) => q.eq("read", false))
      .take(1000);

    return unread.length;
  },
});
