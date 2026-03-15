// @ts-nocheck
import { internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { getMissingFields } from "./helpers";

export const checkAndAutoSend = internalMutation({
  args: {},
  handler: async (ctx) => {
    const settings = await ctx.db.query("appSettings").first();
    const enabled = settings?.dataRequestAutoSendEnabled ?? false;

    if (!enabled) return;

    const delayDays = settings?.dataRequestAutoSendDelayDays ?? 3;
    const expirationHours = settings?.dataRequestExpirationHours ?? 72;
    const now = Date.now();
    const delayMs = delayDays * 24 * 60 * 60 * 1000;

    const allMembers = await ctx.db.query("members").collect();
    let sent = 0;

    for (const member of allMembers) {
      // Must have phone, must have missing data, must be old enough
      if (!member.phone) continue;
      const missing = getMissingFields(member);
      if (missing.length === 0) continue;

      // Only send to members created more than delayDays ago
      if (now - member.createdAt < delayMs) continue;

      // Check for existing pending or completed request
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

      if (existing) continue;

      const token = crypto.randomUUID();
      const requestId = await ctx.db.insert("dataRequests", {
        memberId: member._id,
        token,
        status: "pending",
        sentBy: "automation",
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

    if (sent > 0) {
      console.log(`[dataRequests/cron] Auto-sent ${sent} data request forms`);
    }
  },
});
