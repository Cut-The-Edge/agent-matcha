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

// ── WhatsApp message templates ──────────────────────────────────────

function buildApprovalMessage(name: string, tier: string): string {
  const safeName = sanitizeName(name);
  const tierLabel = tier === "vip" ? "VIP Matchmaking" : "Membership";
  return (
    `Hey ${safeName}! Great news from Club Allenby!\n\n` +
    `Dani reviewed your profile and we'd love to welcome you to our ${tierLabel} program. ` +
    `She'll be reaching out personally to walk you through everything and get you set up.\n\n` +
    `Looking forward to finding you an amazing match!`
  );
}

function buildDenialMessage(name: string): string {
  const safeName = sanitizeName(name);
  return (
    `Hey ${safeName}, thanks so much for your interest in Club Allenby's membership program!\n\n` +
    `After reviewing your profile, we think the best approach for you right now is to stay on our ` +
    `free matching tier. This way, when we spot a match we're truly excited about for you, ` +
    `we'll reach out personally.\n\n` +
    `We're still actively matching for you and looking out for that perfect connection. ` +
    `Feel free to reach out anytime if your situation changes!\n\n` +
    `Warmly,\nThe Club Allenby Team`
  );
}

function buildExpiredMessage(name: string): string {
  const safeName = sanitizeName(name);
  return (
    `Hey ${safeName}, thanks for your interest in Club Allenby's membership options!\n\n` +
    `We wanted to follow up — our team has been busy but we haven't forgotten about you. ` +
    `For now, you're on our free matching tier and we're actively looking for great matches for you.\n\n` +
    `If you're still interested in our membership or VIP programs, just let us know and ` +
    `Dani will reach out to walk you through everything.\n\n` +
    `Warmly,\nThe Club Allenby Team`
  );
}

// ── Send outcome WhatsApp message ───────────────────────────────────

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

    // Build message based on outcome
    let body: string;
    if (args.outcome === "approved") {
      body = buildApprovalMessage(lead.prospectName, lead.tierInterest);
    } else if (args.outcome === "expired") {
      body = buildExpiredMessage(lead.prospectName);
    } else {
      body = buildDenialMessage(lead.prospectName);
    }

    // Try sending with retry
    let lastError: string | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await ctx.runAction(
          internal.integrations.twilio.whatsapp.sendTextMessage,
          { to: phone, body }
        );

        await ctx.runMutation(
          internal.membershipLeads.mutations.markMessageSent,
          { leadId: args.leadId }
        );

        console.log(
          "[sendOutcomeMessage] Sent %s message to %s for lead %s (attempt %d)",
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
      reason: `WhatsApp send failed after ${MAX_RETRIES} attempts: ${lastError}`,
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
