"use node";
// @ts-nocheck
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { WA_TEMPLATES } from "../integrations/twilio/templates";

export const sendDataRequestMessage = internalAction({
  args: {
    requestId: v.id("dataRequests"),
    memberId: v.id("members"),
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const member = await ctx.runQuery(internal.members.queries.getInternal, {
      memberId: args.memberId,
    });

    if (!member || !member.phone) {
      console.error(`[dataRequests] Cannot send - member ${args.memberId} has no phone`);
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.CONVEX_SITE_URL || "";
    const formLink = `${baseUrl}/form/${args.token}`;

    const template = WA_TEMPLATES.DATA_REQUEST;
    const contentVariables = JSON.stringify({
      "1": member.firstName,
      "2": formLink,
    });

    // Send via Twilio
    const result = await ctx.runAction(
      internal.integrations.twilio.templates.sendTemplateMessage,
      {
        to: member.phone,
        contentSid: template.contentSid,
        contentVariables,
      }
    );

    console.log(`[dataRequests] Sent form to ${member.firstName} (${member.phone}), result:`, result?.status);
  },
});

export const syncSubmittedDataToSma = internalAction({
  args: {
    memberId: v.id("members"),
    submittedData: v.any(),
  },
  handler: async (ctx, args) => {
    const member = await ctx.runQuery(internal.members.queries.getInternal, {
      memberId: args.memberId,
    });

    if (!member?.smaId || !/^\d+$/.test(member.smaId)) {
      console.log(`[dataRequests] Skipping SMA sync - member ${args.memberId} has no numeric smaId`);
      return;
    }

    try {
      const { updateClientProfile } = await import("../integrations/smartmatchapp/client");
      const smaClientId = Number(member.smaId);
      const fields: Record<string, string> = {};

      // Map submitted data to SMA profile field IDs
      if (args.submittedData.email) fields.prof_242 = args.submittedData.email;
      if (args.submittedData.instagram) fields.prof_176 = args.submittedData.instagram;
      if (args.submittedData.tiktok) fields.prof_177 = args.submittedData.tiktok;
      if (args.submittedData.linkedin) fields.prof_178 = args.submittedData.linkedin;

      if (Object.keys(fields).length > 0) {
        await updateClientProfile(smaClientId, fields);
        console.log(`[dataRequests] Synced ${Object.keys(fields).length} fields to SMA for member ${member.smaId}`);
      }
    } catch (err: any) {
      console.error(`[dataRequests] SMA sync failed for member ${args.memberId}:`, err?.message || err);
    }
  },
});
