// @ts-nocheck
"use node";
/**
 * SMA Notes — LLM-Generated Match Notes via Files API
 *
 * When a match outcome occurs (rejection, expiry, status update), this action:
 * 1. Checks if a bot-notes file already exists on the client's SMA profile
 * 2. If yes — downloads its content so we can append to it
 * 3. Uses an LLM to read the bot conversation and generate a note for THIS interaction
 * 4. Combines existing content + new note entry
 * 5. Deletes the old file and uploads the new combined file
 *
 * If no file exists yet, it simply creates one with the first note entry.
 */

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  OPENROUTER_API_URL,
  OPENROUTER_MODEL,
  getOpenRouterApiKey,
} from "../openrouter/config";
import {
  listClientFiles,
  uploadClientFile,
  downloadClientFile,
  deleteClientFile,
} from "./client";

// ── LLM Note Generation ──────────────────────────────────────────────

const NOTE_SYSTEM_PROMPT = `You are a concise note writer for Club Allenby, a Jewish matchmaking club. Based on the bot conversation and match outcome provided, write a short matchmaker note for THIS specific match interaction.

Rules:
- Write in third person, using the ACTUAL member and partner names provided — never invent names
- Summarise the member's response and reasoning from the conversation
- Include concrete quotes from the member when available (keep them short)
- End with 2-3 bullet points of key takeaways for the matchmaker
- Keep the note under 200 words — this is ONE entry, not a full history
- Be professional, specific, and actionable — no filler
- Do NOT add any header/footer — just the note content`;

interface NoteInput {
  memberFirstName: string;
  partnerFirstName?: string;
  decision: string;
  categories?: string[];
  subCategories?: Record<string, string>;
  freeText?: string;
  conversationExcerpts?: string;
}

/**
 * Use LLM to generate a note entry for the current match interaction,
 * based on the bot conversation and structured feedback data.
 */
async function generateNoteEntry(data: NoteInput): Promise<string> {
  try {
    const apiKey = getOpenRouterApiKey();

    let userPrompt = `Member: ${data.memberFirstName}\n`;
    userPrompt += `Match with: ${data.partnerFirstName || "Unknown"}\n`;
    userPrompt += `Decision: ${formatDecision(data.decision)}\n`;

    if (data.categories && data.categories.length > 0) {
      userPrompt += `Selected reasons: ${data.categories.join(", ")}\n`;
    }
    if (data.subCategories && Object.keys(data.subCategories).length > 0) {
      const subs = Object.entries(data.subCategories)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
      userPrompt += `Details: ${subs}\n`;
    }
    if (data.freeText) {
      userPrompt += `Member's free text: "${data.freeText}"\n`;
    }

    if (data.conversationExcerpts) {
      userPrompt += `\n=== Bot conversation ===\n${data.conversationExcerpts}\n`;
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          { role: "system", content: NOTE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.4,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API error ${response.status}: ${errorText.slice(0, 200)}`);
    }

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenRouter returned empty content");
    }

    return content.trim();
  } catch (error: any) {
    console.warn("[generateNoteEntry] LLM failed, using fallback:", error?.message);
    return buildFallbackEntry(data);
  }
}

/**
 * Structured fallback when LLM is unavailable.
 */
function buildFallbackEntry(data: NoteInput): string {
  const lines: string[] = [];

  lines.push(`${data.memberFirstName} reviewed ${data.partnerFirstName || "Unknown"}'s profile and ${formatDecision(data.decision).toLowerCase()}.`);

  if (data.categories && data.categories.length > 0) {
    lines.push(`Reasons: ${data.categories.join(", ")}`);
  }
  if (data.subCategories && Object.keys(data.subCategories).length > 0) {
    const subs = Object.entries(data.subCategories)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    lines.push(`Details: ${subs}`);
  }
  if (data.freeText) {
    lines.push(`Member said: "${data.freeText}"`);
  }

  return lines.join("\n");
}

function formatDecision(decision: string): string {
  switch (decision) {
    case "not_interested": return "Rejected";
    case "interested": return "Interested";
    case "passed": return "Passed";
    case "no_response": return "No Response";
    default: return decision.replace(/_/g, " ");
  }
}

// ── File Management ──────────────────────────────────────────────────

const BOT_NOTES_PREFIX = "bot-notes-";

/**
 * Find existing bot-notes file, download its content, delete it,
 * then upload a new file with old content + new entry appended.
 * If no file exists, creates a fresh one.
 */
async function appendAndReplaceNote(
  clientSmaId: number,
  newEntry: string,
): Promise<void> {
  let existingContent = "";

  // 1. List files and look for existing bot-notes file
  try {
    const files = await listClientFiles(clientSmaId);
    const botNoteFiles = files.filter(
      (f: any) => f.name && f.name.startsWith(BOT_NOTES_PREFIX),
    );

    if (botNoteFiles.length > 0) {
      // 2. Download existing content
      const existingFile = botNoteFiles[0]; // should only be one
      try {
        existingContent = await downloadClientFile(clientSmaId, existingFile);
        console.log(
          `[appendAndReplaceNote] Downloaded existing file ${existingFile.id} (${existingFile.name}) for client ${clientSmaId}`,
        );
      } catch (err: any) {
        console.warn(
          `[appendAndReplaceNote] Failed to download file ${existingFile.id}:`,
          err?.message,
        );
        // Continue — we'll create a fresh file with just the new entry
      }

      // 3. Delete old file(s)
      for (const oldFile of botNoteFiles) {
        try {
          await deleteClientFile(clientSmaId, oldFile.id);
          console.log(
            `[appendAndReplaceNote] Deleted old file ${oldFile.id} (${oldFile.name}) for client ${clientSmaId}`,
          );
        } catch (err: any) {
          console.warn(
            `[appendAndReplaceNote] Failed to delete old file ${oldFile.id}:`,
            err?.message,
          );
        }
      }
    }
  } catch (err: any) {
    console.warn(
      `[appendAndReplaceNote] Failed to list files for client ${clientSmaId}:`,
      err?.message,
    );
  }

  // 4. Combine: existing content + separator + new entry
  const date = new Date().toISOString().split("T")[0];
  let combined: string;

  if (existingContent.trim()) {
    // Strip the old footer if present, append new entry, re-add footer
    const stripped = existingContent
      .replace(/\n---\nAuto-generated by Club Allenby Bot\s*$/, "")
      .trimEnd();
    combined = `${stripped}\n\n────────────────────────────────\n[${date}] ${newEntry}\n\n---\nAuto-generated by Club Allenby Bot`;
  } else {
    // First note — create fresh file
    combined = `[${date}] ${newEntry}\n\n---\nAuto-generated by Club Allenby Bot`;
  }

  // 5. Upload combined file
  const fileName = `${BOT_NOTES_PREFIX}${date}.txt`;
  await uploadClientFile(clientSmaId, fileName, combined);
  console.log(`[appendAndReplaceNote] Uploaded ${fileName} for client ${clientSmaId}`);
}

// ── Main Action ──────────────────────────────────────────────────────

export const uploadNotesToSma = internalAction({
  args: {
    matchId: v.id("matches"),
    memberId: v.id("members"),
    feedbackId: v.optional(v.id("feedback")),
    decision: v.optional(v.string()),
    categories: v.optional(v.array(v.string())),
    subCategories: v.optional(v.any()),
    freeText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // 1. Load match and member
      const match = await ctx.runQuery(internal.matches.queries.getInternal, {
        matchId: args.matchId,
      });
      if (!match) {
        console.warn("[uploadNotesToSma] Match not found:", args.matchId);
        return;
      }

      const member = await ctx.runQuery(internal.members.queries.getInternal, {
        memberId: args.memberId,
      });
      if (!member) {
        console.warn("[uploadNotesToSma] Member not found:", args.memberId);
        return;
      }

      // Skip if member has no numeric SMA ID (sandbox/test)
      const clientSmaId = member.smaId ? parseInt(member.smaId, 10) : NaN;
      if (isNaN(clientSmaId)) {
        console.log("[uploadNotesToSma] Skipping — member has no numeric smaId:", member.smaId);
        return;
      }

      // Load partner name
      const partnerId = match.memberAId === args.memberId ? match.memberBId : match.memberAId;
      const partner = await ctx.runQuery(internal.members.queries.getInternal, {
        memberId: partnerId,
      });
      const partnerFirstName = partner?.firstName || "Unknown";

      // 2. Load recent conversation so the LLM can understand what the member said
      let conversationExcerpts = "";
      try {
        const recentMessages = await ctx.runQuery(
          internal.engine.transitions.getRecentMessages,
          { memberId: args.memberId, limit: 30 },
        );
        if (recentMessages && recentMessages.length > 0) {
          const sorted = [...recentMessages].reverse();
          conversationExcerpts = sorted
            .map((msg: any) => {
              const dir = msg.direction === "inbound" ? "Member" : "Bot";
              return `${dir}: ${msg.content.slice(0, 200)}`;
            })
            .join("\n");
        }
      } catch (err: any) {
        console.warn("[uploadNotesToSma] Failed to load conversation:", err?.message);
      }

      // 3. Generate LLM note for THIS interaction
      const noteEntry = await generateNoteEntry({
        memberFirstName: member.firstName,
        partnerFirstName,
        decision: args.decision || "unknown",
        categories: args.categories,
        subCategories: args.subCategories,
        freeText: args.freeText,
        conversationExcerpts: conversationExcerpts || undefined,
      });

      // 4. Download existing file (if any), append new entry, re-upload
      await appendAndReplaceNote(clientSmaId, noteEntry);

      // 5. Mark feedback as synced
      if (args.feedbackId) {
        await ctx.runMutation(internal.feedback.mutations.markSynced, {
          feedbackId: args.feedbackId,
        });
      }

      console.log(
        `[uploadNotesToSma] Done for member ${member.firstName} (smaId=${clientSmaId}), match ${args.matchId}`,
      );
    } catch (error: any) {
      // Never break the main flow — log and move on
      console.error("[uploadNotesToSma] Failed:", error?.message);
    }
  },
});
