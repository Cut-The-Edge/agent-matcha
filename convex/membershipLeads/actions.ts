// @ts-nocheck
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  updateClientProfile,
  listClientFiles,
  uploadClientFile,
  downloadClientFile,
  deleteClientFile,
} from "../integrations/smartmatchapp/client";
import { WA_TEMPLATES } from "../integrations/twilio/templates";

// ── SMA Membership Type mapping ─────────────────────────────────────
// prof_197 = Membership Type field in SMA
const MEMBERSHIP_TYPE_MAP: Record<string, string> = {
  member: "2",  // Membership / Initiation + Quarterly Fee & All Access
  vip: "6",     // VIP Matchmaking / High Ticket Clients
};

// Max retries for external API calls
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 10_000; // 10 seconds

// ── Name sanitization ───────────────────────────────────────────────

/**
 * Sanitize a name for use in WhatsApp messages.
 * Strips formatting chars, trims, and limits length.
 */
function sanitizeName(name: string): string {
  return name
    .replace(/[*_~`]/g, "")  // Strip WhatsApp formatting chars
    .trim()
    .slice(0, 50);           // Limit length
}

// ── Send outcome WhatsApp message ───────────────────────────────────
// Uses pre-approved Twilio Content Templates (registered in templates.ts)
// so messages work outside the 24h WhatsApp session window.

export const sendOutcomeMessage = internalAction({
  args: {
    leadId: v.id("membershipLeads"),
    outcome: v.union(
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired"),
    ),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.runQuery(
      internal.membershipLeads.queries.getInternal,
      { leadId: args.leadId }
    );
    if (!lead) {
      console.warn("[sendOutcomeMessage] Lead not found:", args.leadId);
      return;
    }

    // Find phone number: from lead directly or from member
    let phone = lead.prospectPhone;
    if (!phone && lead.memberId) {
      const member = await ctx.runQuery(
        internal.members.queries.getInternal,
        { memberId: lead.memberId }
      );
      phone = member?.phone || member?.whatsappId;
    }

    if (!phone) {
      console.warn("[sendOutcomeMessage] No phone number for lead:", args.leadId);
      // Log the failure so it's visible in audit
      await ctx.runMutation(internal.membershipLeads.mutations.logSendFailure, {
        leadId: args.leadId,
        reason: "No phone number available",
      });
      return;
    }

    // Resolve template + variables based on outcome
    const safeName = sanitizeName(lead.prospectName);
    let contentSid: string;
    let contentVariables: string;

    if (args.outcome === "approved") {
      const tierLabel = lead.tierInterest === "vip" ? "VIP Matchmaking" : "Membership";
      contentSid = WA_TEMPLATES.LEAD_APPROVED.contentSid;
      contentVariables = JSON.stringify({ "1": safeName, "2": tierLabel });
    } else if (args.outcome === "expired") {
      contentSid = WA_TEMPLATES.LEAD_EXPIRED.contentSid;
      contentVariables = JSON.stringify({ "1": safeName });
    } else {
      contentSid = WA_TEMPLATES.LEAD_DENIED.contentSid;
      contentVariables = JSON.stringify({ "1": safeName });
    }

    // Try sending with retry
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await ctx.runAction(
          internal.integrations.twilio.templates.sendTemplateMessage,
          { to: phone, contentSid, contentVariables }
        );

        await ctx.runMutation(
          internal.membershipLeads.mutations.markMessageSent,
          { leadId: args.leadId }
        );

        console.log(
          "[sendOutcomeMessage] Sent %s template to %s for lead %s (attempt %d)",
          args.outcome, phone, args.leadId, attempt
        );
        return; // Success — exit
      } catch (error: any) {
        lastError = error?.message || "Unknown error";
        console.error(
          "[sendOutcomeMessage] Attempt %d/%d failed: %s",
          attempt, MAX_RETRIES, lastError
        );
        if (attempt < MAX_RETRIES) {
          // Wait before retrying
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    // All retries exhausted — log the failure
    console.error("[sendOutcomeMessage] All retries exhausted for lead:", args.leadId);
    await ctx.runMutation(internal.membershipLeads.mutations.logSendFailure, {
      leadId: args.leadId,
      reason: `WhatsApp template send failed after ${MAX_RETRIES} attempts: ${lastError}`,
    });
  },
});

// ── Sync lead outcome to SMA notes ──────────────────────────────────

const BOT_NOTES_PREFIX = "bot-notes-";

export const syncLeadToSma = internalAction({
  args: { leadId: v.id("membershipLeads") },
  handler: async (ctx, args) => {
    const lead = await ctx.runQuery(
      internal.membershipLeads.queries.getInternal,
      { leadId: args.leadId }
    );
    if (!lead || !lead.memberId) {
      console.log("[syncLeadToSma] Skipping — no member linked to lead:", args.leadId);
      return;
    }

    const member = await ctx.runQuery(
      internal.members.queries.getInternal,
      { memberId: lead.memberId }
    );
    if (!member?.smaId || !/^\d+$/.test(member.smaId)) {
      console.log("[syncLeadToSma] Skipping — member has no numeric smaId");
      return;
    }

    const clientSmaId = parseInt(member.smaId, 10);

    // Build the note entry
    const statusLabel =
      lead.status === "approved" ? "APPROVED" :
      lead.status === "denied" ? "DENIED" :
      "EXPIRED (no response within SLA)";

    const tierLabel = lead.tierInterest === "vip" ? "VIP Matchmaking" : "Membership";

    let noteEntry = `Membership Lead — ${tierLabel}: ${statusLabel}`;
    if (lead.resolvedBy) noteEntry += ` by ${lead.resolvedBy}`;
    if (lead.adminNotes) noteEntry += `\nNotes: ${lead.adminNotes}`;

    try {
      await appendAndReplaceNote(clientSmaId, noteEntry);

      await ctx.runMutation(
        internal.membershipLeads.mutations.markSmaSynced,
        { leadId: args.leadId }
      );

      console.log("[syncLeadToSma] Synced note for client %d, lead %s", clientSmaId, args.leadId);
    } catch (error: any) {
      console.error("[syncLeadToSma] Failed:", error?.message);
      // Log failure to audit so admins can see it
      await ctx.runMutation(internal.membershipLeads.mutations.logSendFailure, {
        leadId: args.leadId,
        reason: `SMA note sync failed: ${error?.message}`,
      });
    }
  },
});

/**
 * Append note to SMA bot-notes file (same pattern as smartmatchapp/notes.ts).
 */
async function appendAndReplaceNote(
  clientSmaId: number,
  newEntry: string,
): Promise<void> {
  let existingContent = "";

  try {
    const files = await listClientFiles(clientSmaId);
    const botNoteFiles = files.filter(
      (f: any) => f.name && f.name.startsWith(BOT_NOTES_PREFIX),
    );

    if (botNoteFiles.length > 0) {
      const existingFile = botNoteFiles[0];
      try {
        existingContent = await downloadClientFile(clientSmaId, existingFile);
      } catch (err: any) {
        console.warn("[appendAndReplaceNote] Failed to download:", err?.message);
      }

      for (const oldFile of botNoteFiles) {
        try {
          await deleteClientFile(clientSmaId, oldFile.id);
        } catch (err: any) {
          console.warn("[appendAndReplaceNote] Failed to delete:", err?.message);
        }
      }
    }
  } catch (err: any) {
    console.warn("[appendAndReplaceNote] Failed to list files:", err?.message);
  }

  const date = new Date().toISOString().split("T")[0];
  let combined: string;

  if (existingContent.trim()) {
    const stripped = existingContent
      .replace(/\n---\nAuto-generated by Club Allenby Bot\s*$/, "")
      .trimEnd();
    combined = `${stripped}\n\n────────────────────────────────\n[${date}] ${newEntry}\n\n---\nAuto-generated by Club Allenby Bot`;
  } else {
    combined = `[${date}] ${newEntry}\n\n---\nAuto-generated by Club Allenby Bot`;
  }

  const fileName = `${BOT_NOTES_PREFIX}${date}.txt`;
  await uploadClientFile(clientSmaId, fileName, combined);
}

// ── Update SMA Membership Type (prof_197) ───────────────────────────

export const updateSmaMembershipType = internalAction({
  args: { leadId: v.id("membershipLeads") },
  handler: async (ctx, args) => {
    const lead = await ctx.runQuery(
      internal.membershipLeads.queries.getInternal,
      { leadId: args.leadId }
    );
    if (!lead || !lead.memberId || lead.status !== "approved") {
      console.log("[updateSmaMembershipType] Skipping — lead not approved or no member");
      return;
    }

    const member = await ctx.runQuery(
      internal.members.queries.getInternal,
      { memberId: lead.memberId }
    );
    if (!member?.smaId || !/^\d+$/.test(member.smaId)) {
      console.log("[updateSmaMembershipType] Skipping — member has no numeric smaId");
      return;
    }

    const clientSmaId = parseInt(member.smaId, 10);
    const typeId = MEMBERSHIP_TYPE_MAP[lead.tierInterest];

    if (!typeId) {
      console.warn("[updateSmaMembershipType] Unknown tier:", lead.tierInterest);
      return;
    }

    try {
      await updateClientProfile(clientSmaId, { prof_197: typeId });
      console.log(
        "[updateSmaMembershipType] Updated client %d prof_197=%s (%s)",
        clientSmaId, typeId, lead.tierInterest
      );
    } catch (error: any) {
      console.error("[updateSmaMembershipType] Failed:", error?.message);
      await ctx.runMutation(internal.membershipLeads.mutations.logSendFailure, {
        leadId: args.leadId,
        reason: `SMA profile update (prof_197) failed: ${error?.message}`,
      });
    }
  },
});
