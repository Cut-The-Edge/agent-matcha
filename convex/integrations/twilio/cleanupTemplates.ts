// @ts-nocheck
"use node";
/**
 * One-Time Cleanup: Delete Junk WhatsApp Content Templates
 *
 * Deletes all on-the-fly templates created by the old interactive.ts
 * (names starting with "matcha_qr_" or "matcha_lp_").
 *
 * Run via Convex dashboard: Actions → cleanupJunkTemplates
 */

import { internalAction } from "../../_generated/server";

export const cleanupJunkTemplates = internalAction({
  args: {},
  handler: async () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const authHeader =
      "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64");

    let deletedCount = 0;
    let pageUrl: string | null =
      "https://content.twilio.com/v1/Content?PageSize=50";

    while (pageUrl) {
      const response = await fetch(pageUrl, {
        headers: { Authorization: authHeader },
      });

      if (!response.ok) {
        console.error(
          `[cleanup] List failed (${response.status}):`,
          await response.text()
        );
        break;
      }

      const data = await response.json();
      const contents: Array<{ sid: string; friendly_name: string }> =
        data.contents || [];

      // Filter junk templates
      const junkTemplates = contents.filter(
        (t) =>
          t.friendly_name.startsWith("matcha_qr_") ||
          t.friendly_name.startsWith("matcha_lp_")
      );

      console.log(
        `[cleanup] Page: ${contents.length} total, ${junkTemplates.length} junk`
      );

      // Delete each junk template
      for (const template of junkTemplates) {
        const deleteResponse = await fetch(
          `https://content.twilio.com/v1/Content/${template.sid}`,
          {
            method: "DELETE",
            headers: { Authorization: authHeader },
          }
        );

        if (deleteResponse.ok || deleteResponse.status === 204) {
          deletedCount++;
          console.log(
            `[cleanup] Deleted: ${template.friendly_name} (${template.sid})`
          );
        } else {
          console.error(
            `[cleanup] Failed to delete ${template.sid}:`,
            deleteResponse.status
          );
        }
      }

      // Next page
      pageUrl = data.meta?.next_page_url || null;
    }

    console.log(`[cleanup] Done! Deleted ${deletedCount} junk templates.`);
    return { deletedCount };
  },
});
