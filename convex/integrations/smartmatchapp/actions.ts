// @ts-nocheck
/**
 * SmartMatchApp Integration Actions
 *
 * Internal actions that call the SMA API (external HTTP).
 * These are called by the webhook handler and cron jobs.
 */

import { action, internalAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import { fetchAndMapClient, fetchAndMapIntroductions } from "./contacts";
import {
  getClientMatches,
  updateClientMatch,
  getClientProfile,
  getClientPreferences,
  updateClientProfile,
  updateClientPreferences,
  listClientFiles,
  uploadClientFile,
  downloadClientFile,
  deleteClientFile,
} from "./client";

/**
 * Handle a match_added event from SMA.
 *
 * 1. Look up both members in local DB (they should already exist from client_created webhooks)
 * 2. Create stub members if not found (defensive)
 * 3. Trigger the WhatsApp match feedback flow
 */
export const handleMatchAdded = internalAction({
  args: {
    smaMatchId: v.number(),
    clientId: v.number(),
    matchId: v.number(),
    groupName: v.optional(v.string()),
    groupId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Safety filter: only process if test client is involved
    const testClientId = process.env.SMA_TEST_CLIENT_ID;
    if (testClientId) {
      const testIds = new Set(testClientId.split(",").map((id) => parseInt(id.trim(), 10)));
      if (!testIds.has(args.clientId) && !testIds.has(args.matchId)) {
        console.log(
          `SMA match_added skipped: neither client ${args.clientId} nor match ${args.matchId} is in test clients [${[...testIds]}]`
        );
        return { skipped: true, reason: "test_filter" };
      }
    }

    console.log(
      `SMA match_added: processing match ${args.smaMatchId} between client ${args.clientId} and ${args.matchId}`
    );

    // Look up both members from local DB (should already exist from client_created webhooks)
    const smaIdA = String(args.clientId);
    const smaIdB = String(args.matchId);

    let memberA = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId: smaIdA });
    let memberB = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId: smaIdB });

    // Fetch full profile from SMA API if member not found (or is a stub)
    if (!memberA || memberA.firstName === "Unknown") {
      console.log(`SMA match_added: fetching profile for client ${args.clientId}`);
      try {
        const apiData = await fetchAndMapClient(args.clientId);
        await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
          smaId: apiData.smaId,
          firstName: apiData.firstName,
          middleName: apiData.middleName,
          lastName: apiData.lastName,
          email: apiData.email,
          phone: apiData.phone,
          profilePictureUrl: apiData.profilePictureUrl,
          location: apiData.location,
          gender: apiData.gender,
          profileData: apiData.smaProfile,

          tier: apiData.tier,
          profileComplete: apiData.profileComplete,
          matchmakerNotes: apiData.matchmakerNotes,
        });
      } catch (err) {
        console.warn(`SMA match_added: failed to fetch profile for client ${args.clientId}, creating stub:`, err);
        if (!memberA) {
          await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
            smaId: smaIdA,
            firstName: "Unknown",
          });
        }
      }
      memberA = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId: smaIdA });
    }

    if (!memberB || memberB.firstName === "Unknown") {
      console.log(`SMA match_added: fetching profile for match ${args.matchId}`);
      try {
        const apiData = await fetchAndMapClient(args.matchId);
        await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
          smaId: apiData.smaId,
          firstName: apiData.firstName,
          middleName: apiData.middleName,
          lastName: apiData.lastName,
          email: apiData.email,
          phone: apiData.phone,
          profilePictureUrl: apiData.profilePictureUrl,
          location: apiData.location,
          gender: apiData.gender,
          profileData: apiData.smaProfile,

          tier: apiData.tier,
          profileComplete: apiData.profileComplete,
          matchmakerNotes: apiData.matchmakerNotes,
        });
      } catch (err) {
        console.warn(`SMA match_added: failed to fetch profile for match ${args.matchId}, creating stub:`, err);
        if (!memberB) {
          await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
            smaId: smaIdB,
            firstName: "Unknown",
          });
        }
      }
      memberB = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId: smaIdB });
    }

    // Trigger the existing match flow
    const flowResult = await ctx.runMutation(
      internal.integrations.crm.mutations.processMatchCreated,
      {
        smaMatchId: String(args.smaMatchId),
        smaIdA,
        smaIdB,
        memberAName: memberA?.firstName,
        memberBName: memberB?.firstName,
        smaGroupId: args.groupId,
        smaGroupName: args.groupName,
      }
    );

    console.log(
      `SMA match flow started: matchId=${flowResult.matchId}, flows=${flowResult.flowInstancesStarted}`
    );

    return {
      skipped: false,
      matchId: flowResult.matchId,
      flowInstancesStarted: flowResult.flowInstancesStarted,
    };
  },
});

/**
 * Handle a client sync event (client_created, client_updated, client_profile_updated).
 *
 * Fetches the client profile from SMA and upserts into local DB.
 */
/**
 * Map SMA prof_XXX / pref_XXX keys from a webhook payload to our member fields.
 * Returns only the fields that were present in the payload.
 */
function mapWebhookPayload(payload: Record<string, any>): Record<string, any> {
  const FIELD_MAP: Record<string, string> = {
    prof_239: "firstName",
    prof_240: "middleName",
    prof_241: "lastName",
    prof_242: "email",
    prof_243: "phone",
    prof_132: "gender",
    prof_235: "matchmakerNotes",
    prof_237: "profilePictureUrl",
    prof_244: "location",
    prof_197: "membershipType",
  };

  const mapped: Record<string, any> = {};
  for (const [key, ourKey] of Object.entries(FIELD_MAP)) {
    if (key in payload) {
      const val = payload[key];
      // Select fields come as { choice, choice_label } or array of them
      if (ourKey === "membershipType" && Array.isArray(val)) {
        const ids = val.map((v: any) => v.choice);
        if (ids.includes(6)) mapped.tier = "vip";
        else if (ids.includes(2)) mapped.tier = "member";
        else mapped.tier = "free";
      } else if (ourKey === "gender") {
        // Select field: normalize label to our enum
        const label = typeof val === "object" ? val?.choice_label : val;
        if (typeof label === "string") {
          const lower = label.toLowerCase();
          if (lower === "male" || lower === "man") mapped.gender = "male";
          else if (lower === "female" || lower === "woman") mapped.gender = "female";
          else mapped.gender = "other";
        }
      } else if (ourKey === "profilePictureUrl") {
        // Image type: { name, url } → extract url
        if (typeof val === "object" && val?.url) {
          mapped[ourKey] = val.url;
        } else if (typeof val === "string") {
          mapped[ourKey] = val;
        }
      } else if (ourKey === "location") {
        // Location type: { country, city, state, zip_code } → structured object
        if (typeof val === "object" && val !== null) {
          mapped[ourKey] = {
            country: val.country || undefined,
            city: val.city || undefined,
            state: val.state || undefined,
            zipCode: val.zip_code || undefined,
          };
        }
      } else if (typeof val === "object" && val?.choice_label) {
        mapped[ourKey] = val.choice_label;
      } else {
        mapped[ourKey] = val;
      }
    }
  }
  return mapped;
}

export const handleClientSync = internalAction({
  args: {
    smaClientId: v.number(),
    event: v.string(),
    webhookPayload: v.any(),
  },
  handler: async (ctx, args) => {
    // Safety filter: only process if this is a test client
    const testClientId = process.env.SMA_TEST_CLIENT_ID;
    if (testClientId) {
      const testIds = new Set(testClientId.split(",").map((id) => parseInt(id.trim(), 10)));
      if (!testIds.has(args.smaClientId)) {
        console.log(
          `SMA ${args.event} skipped: client ${args.smaClientId} is not in test clients [${[...testIds]}]`
        );
        return { skipped: true, reason: "test_filter" };
      }
    }

    const mapped = mapWebhookPayload(args.webhookPayload ?? {});
    const smaId = String(args.smaClientId);

    console.log(
      `SMA ${args.event}: client ${args.smaClientId}, mapped fields:`,
      JSON.stringify(mapped)
    );

    // Check if the member exists and has real data
    const existing = await ctx.runQuery(
      internal.members.queries.getBySmaIdInternal,
      { smaId }
    );
    const needsFullProfile =
      !existing || existing.firstName === "Unknown" || !existing.firstName;

    // Debounce: skip API call if member was synced in the last 60s
    // (SMA often sends client_updated + client_profile_updated for the same change)
    const recentlySynced = existing?.lastSyncedAt && (Date.now() - existing.lastSyncedAt < 60_000);

    let syncData: Record<string, any> = { ...mapped };

    // API fallback: fetch full profile if member is new or has placeholder data
    if (needsFullProfile && !recentlySynced) {
      try {
        console.log(
          `SMA ${args.event}: fetching full profile for client ${args.smaClientId} (API fallback)`
        );
        const apiData = await fetchAndMapClient(args.smaClientId);
        // Merge: webhook fields take priority, API fills gaps
        syncData = { ...apiData, ...mapped };
      } catch (err) {
        console.warn(
          `SMA ${args.event}: API fallback failed for client ${args.smaClientId}:`,
          err
        );
      }
    }

    const result = await ctx.runMutation(
      internal.members.mutations.syncFromSmaInternal,
      {
        smaId,
        firstName: syncData.firstName ?? "",
        middleName: syncData.middleName,
        lastName: syncData.lastName,
        email: syncData.email,
        phone: syncData.phone,
        profilePictureUrl: syncData.profilePictureUrl,
        location: syncData.location,
        gender: syncData.gender,
        profileData: syncData.smaProfile,

        tier: syncData.tier,
        profileComplete: syncData.profileComplete,
        matchmakerNotes: syncData.matchmakerNotes,
      }
    );

    console.log(
      `SMA client synced: smaId=${smaId} (${result.action}), memberId=${result.memberId}`
    );

    return {
      memberId: result.memberId,
      action: result.action,
      mappedFields: syncData,
    };
  },
});

/**
 * Map a final_status keyword to the SMA group name substring used in groupNameToKey.
 */
const STATUS_TO_GROUP_KEYWORD: Record<string, string> = {
  rejected: "Rejected",
  past: "Past",
  active: "Active",
  successful: "Successful",
  potential: "Potential",
  notSuitable: "Not Suitable",
  automated: "Automated",
};

/**
 * Update a match's group in SMA CRM.
 *
 * Called by the flow executor after sync_to_sma / update_match_status actions
 * to move matches between groups (Automated Intro → Rejected, Past, etc.).
 *
 * Needs: the SMA match ID (from the match's smaIntroId) and both member SMA IDs.
 */
/**
 * Map our internal status to SMA match status ID.
 * SMA dropdown: 1 = Interested, 2 = Not Interested
 */
const STATUS_TO_MATCH_STATUS: Record<string, string> = {
  active: "1",       // Interested — paid upsell / active intro
  interested: "1",   // Interested
  rejected: "2",     // Not Interested
  past: "2",         // Not Interested — expired / no response
  not_interested: "2",
};

export const updateMatchInSma = internalAction({
  args: {
    matchId: v.id("matches"),
    finalStatus: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Read match to get smaIntroId and member IDs
    const match = await ctx.runQuery(internal.matches.queries.getInternal, {
      matchId: args.matchId,
    });

    if (!match) {
      console.warn(`updateMatchInSma: match ${args.matchId} not found`);
      return { success: false, reason: "match_not_found" };
    }

    if (!match.smaIntroId) {
      console.warn(`updateMatchInSma: match ${args.matchId} has no smaIntroId — skipping SMA sync`);
      return { success: false, reason: "no_sma_intro_id" };
    }

    // Get the SMA match ID (the numeric intro ID from SMA)
    const smaMatchId = parseInt(match.smaIntroId, 10);
    if (isNaN(smaMatchId)) {
      // Sandbox matches have smaIntroId like "sandbox-1234" — skip SMA sync
      console.log(`updateMatchInSma: skipping sandbox match ${match.smaIntroId}`);
      return { success: false, reason: "sandbox_match" };
    }

    // Get member SMA IDs to know which client to update
    const memberA = await ctx.runQuery(internal.members.queries.getInternal, {
      memberId: match.memberAId,
    });
    const memberB = await ctx.runQuery(internal.members.queries.getInternal, {
      memberId: match.memberBId,
    });

    if (!memberA?.smaId) {
      console.warn(`updateMatchInSma: memberA has no smaId for match ${args.matchId}`);
      return { success: false, reason: "no_sma_ids" };
    }

    const clientSmaId = parseInt(memberA.smaId, 10);
    const partnerSmaId = memberB?.smaId ? parseInt(memberB.smaId, 10) : 0;

    // Resolve target group ID by fetching real groups from SMA API.
    // We call getClientMatches to discover all group { id, name } pairs,
    // then match by keyword. This avoids stale fallback IDs.
    const keyword = STATUS_TO_GROUP_KEYWORD[args.finalStatus] ||
      STATUS_TO_GROUP_KEYWORD[args.finalStatus.toLowerCase()] ||
      args.finalStatus;
    const keywordLower = keyword.toLowerCase();

    let groupId: number | null = null;

    try {
      const clientMatches = await getClientMatches(clientSmaId);
      const groups = new Map<string, number>();
      for (const m of clientMatches?.objects ?? []) {
        if (m.group?.id && m.group?.name) {
          groups.set(m.group.name.toLowerCase(), m.group.id);
        }
      }
      // Find group whose name contains the keyword (e.g. "active" → "Active Introductions")
      for (const [name, id] of groups) {
        if (name.includes(keywordLower)) {
          groupId = id;
          console.log(`updateMatchInSma: resolved "${keyword}" → group ${id} (${name}) from API`);
          break;
        }
      }
    } catch (err) {
      console.warn(`updateMatchInSma: failed to fetch groups from API, trying local fallback:`, err);
    }

    // Fallback to local DB lookup if API didn't return the group
    if (!groupId) {
      const existingIntro = await ctx.runQuery(
        internal.integrations.smartmatchapp.queries.findGroupIdByName,
        { keyword }
      );
      if (existingIntro) {
        groupId = existingIntro.groupId;
        console.log(`updateMatchInSma: resolved "${keyword}" → group ${groupId} from local fallback`);
      }
    }

    if (!groupId) {
      console.warn(
        `updateMatchInSma: could not resolve group ID for "${args.finalStatus}" (keyword: ${keyword}).`
      );
      return { success: false, reason: "unknown_group_id" };
    }

    // Resolve match status ID (Interested / Not Interested)
    const matchStatusId = STATUS_TO_MATCH_STATUS[args.finalStatus] ||
      STATUS_TO_MATCH_STATUS[args.finalStatus.toLowerCase()];

    // Build update fields: group + optional match status
    const updateFields: Record<string, string> = { group: String(groupId) };
    if (matchStatusId) {
      updateFields.status = matchStatusId;
    }

    // SMA API: PUT /clients/<client_id>/matches/<match_id>/
    try {
      await updateClientMatch(clientSmaId, smaMatchId, updateFields);
      console.log(
        `updateMatchInSma: moved match ${smaMatchId} to group ${groupId} (${args.finalStatus})` +
        `${matchStatusId ? `, status=${matchStatusId}` : ""} for client ${clientSmaId}`
      );

      // Also update the partner side
      if (partnerSmaId) {
        // Find the partner's match record for this same intro
        try {
          const partnerMatches = await getClientMatches(partnerSmaId);
          const partnerMatch = partnerMatches?.objects?.find(
            (m: any) => m.match?.id === clientSmaId || m.client?.id === clientSmaId
          );
          if (partnerMatch) {
            await updateClientMatch(partnerSmaId, partnerMatch.id, updateFields);
            console.log(
              `updateMatchInSma: also moved partner match ${partnerMatch.id} for client ${partnerSmaId}`
            );
          }
        } catch (err) {
          console.warn(`updateMatchInSma: failed to update partner side:`, err);
        }
      }

      return { success: true, groupId, matchStatusId };
    } catch (err: any) {
      console.error(`updateMatchInSma: SMA API failed:`, err.message);
      return { success: false, reason: err.message };
    }
  },
});

/**
 * Sync introductions for a single member by SMA client ID.
 * Used by webhooks to auto-refresh intro data when matches change.
 */
export const syncMemberIntros = internalAction({
  args: { smaClientId: v.number() },
  handler: async (ctx, args) => {
    const introData = await fetchAndMapIntroductions(
      args.smaClientId,
      async (smaId: string) => {
        return await ctx.runQuery(internal.members.queries.lookupPartnerNameInternal, { smaId });
      },
    );
    await ctx.runMutation(internal.members.mutations.syncIntrosInternal, {
      memberSmaId: String(args.smaClientId),
      summary: introData.summary,
      introductions: introData.introductions,
    });
    return { total: introData.summary.total };
  },
});

/**
 * Re-sync intros for all members affected by a given SMA match ID.
 * Called by match_updated / match_group_changed / match_deleted webhooks,
 * where we only know the match record ID, not the client IDs.
 */
export const syncIntrosForMatch = internalAction({
  args: { smaMatchId: v.number() },
  handler: async (ctx, args) => {
    const memberSmaIds = await ctx.runQuery(
      internal.members.queries.getMemberSmaIdsByMatchId,
      { smaMatchId: args.smaMatchId },
    );
    for (const smaId of memberSmaIds) {
      try {
        await ctx.runAction(
          internal.integrations.smartmatchapp.actions.syncMemberIntros,
          { smaClientId: Number(smaId) },
        );
      } catch (err) {
        console.warn(`Failed to re-sync intros for smaId=${smaId} after match change:`, err);
      }
    }
  },
});

/**
 * Fetch a single member's profile from SMA API and upsert into DB.
 * Internal-only — used by syncIntrosInternal to backfill "Unknown" stub members.
 */
export const fetchProfile = internalAction({
  args: { smaClientId: v.number() },
  handler: async (ctx, args) => {
    const apiData = await fetchAndMapClient(args.smaClientId);
    await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
      smaId: apiData.smaId,
      firstName: apiData.firstName,
      middleName: apiData.middleName,
      lastName: apiData.lastName,
      email: apiData.email,
      phone: apiData.phone,
      profilePictureUrl: apiData.profilePictureUrl,
      location: apiData.location,
      gender: apiData.gender,
      profileData: apiData.smaProfile,

      tier: apiData.tier,
      profileComplete: apiData.profileComplete,
      matchmakerNotes: apiData.matchmakerNotes,
    });
    return { smaId: apiData.smaId, firstName: apiData.firstName };
  },
});

/**
 * Sync a single member's full profile from SMA API.
 * Callable from the frontend (user-facing action).
 */
export const syncMember = action({
  args: {
    sessionToken: v.optional(v.string()),
    smaClientId: v.number(),
  },
  handler: async (ctx, args) => {
    const apiData = await fetchAndMapClient(args.smaClientId);

    const result = await ctx.runMutation(
      internal.members.mutations.syncFromSmaInternal,
      {
        smaId: apiData.smaId,
        firstName: apiData.firstName,
        middleName: apiData.middleName,
        lastName: apiData.lastName,
        email: apiData.email,
        phone: apiData.phone,
        profilePictureUrl: apiData.profilePictureUrl,
        location: apiData.location,
        gender: apiData.gender,
        profileData: apiData.smaProfile,
  
        tier: apiData.tier,
        profileComplete: apiData.profileComplete,
        matchmakerNotes: apiData.matchmakerNotes,
      }
    );

    // Sync introductions
    try {
      const introData = await fetchAndMapIntroductions(
        args.smaClientId,
        async (smaId: string) => {
          return await ctx.runQuery(internal.members.queries.lookupPartnerNameInternal, { smaId });
        },
      );
      await ctx.runMutation(internal.members.mutations.syncIntrosInternal, {
        memberSmaId: String(args.smaClientId),
        summary: introData.summary,
        introductions: introData.introductions,
      });
    } catch (err) {
      console.warn(`Failed to sync intros for client ${args.smaClientId}:`, err);
    }

    return { memberId: result.memberId, action: result.action };
  },
});

/**
 * Reset a client's CRM profile in SMA.
 * Clears everything except first name, last name, and phone.
 * Deletes all files (including cover photo) and clears all preferences.
 * Then re-syncs the cleaned profile back to local DB.
 */
export const resetCrmProfile = action({
  args: {
    sessionToken: v.optional(v.string()),
    smaClientId: v.number(),
  },
  handler: async (ctx, args) => {
    const KEEP_FIELDS = new Set(["prof_239", "prof_241", "prof_243"]);

    // Step 1: Get current profile to discover which fields to clear
    const profileGroups = await getClientProfile(args.smaClientId);
    const clearData: Record<string, string> = {};

    for (const group of profileGroups) {
      if (!group.fields) continue;
      for (const [fieldId, field] of Object.entries(group.fields)) {
        if (KEEP_FIELDS.has(fieldId)) continue;
        if ((field as any).value == null || (field as any).value === "") continue;

        const type = ((field as any).type ?? "").toLowerCase();
        if (type === "location") {
          clearData[`${fieldId}_country`] = "";
          clearData[`${fieldId}_city`] = "";
          clearData[`${fieldId}_state`] = "";
          clearData[`${fieldId}_zip_code`] = "";
        } else {
          clearData[fieldId] = "";
        }
      }
    }

    if (Object.keys(clearData).length > 0) {
      await updateClientProfile(args.smaClientId, clearData);
    }
    console.log(`resetCrmProfile: cleared ${Object.keys(clearData).length} profile fields for client ${args.smaClientId}`);

    // Step 2: Clear preferences one-by-one (SMA rejects bulk empty updates)
    // Rate limit: 10 req / 10s → add 1.1s delay between requests
    const prefGroups = await getClientPreferences(args.smaClientId);
    let prefsCleared = 0;
    let prefIdx = 0;

    for (const group of prefGroups) {
      if (!group.fields) continue;
      for (const [fieldId, field] of Object.entries(group.fields)) {
        if ((field as any).value == null || (field as any).value === "") continue;

        const val = (field as any).value;
        const clearEntry: Record<string, string> = {};

        if (typeof val === "object" && val !== null && "start" in val) {
          clearEntry[`${fieldId}_start`] = "";
          clearEntry[`${fieldId}_end`] = "";
        } else {
          clearEntry[fieldId] = "";
        }

        if (prefIdx > 0 && prefIdx % 9 === 0) {
          await new Promise((r) => setTimeout(r, 10500));
        }

        try {
          await updateClientPreferences(args.smaClientId, clearEntry);
          prefsCleared++;
        } catch (err) {
          console.warn(`resetCrmProfile: could not clear pref ${fieldId}:`, err);
        }
        prefIdx++;
      }
    }
    console.log(`resetCrmProfile: cleared ${prefsCleared} preference fields for client ${args.smaClientId}`);

    // Step 3: Delete all files (cover photo, bot notes, etc.)
    const files = await listClientFiles(args.smaClientId);
    for (const file of files) {
      try {
        await deleteClientFile(args.smaClientId, file.id);
      } catch (err) {
        console.warn(`resetCrmProfile: failed to delete file ${file.id}:`, err);
      }
    }
    console.log(`resetCrmProfile: deleted ${files.length} files for client ${args.smaClientId}`);

    // Step 4: Re-sync from SMA and explicitly clear local fields
    const apiData = await fetchAndMapClient(args.smaClientId);
    await ctx.runMutation(
      internal.members.mutations.syncFromSmaInternal,
      {
        smaId: apiData.smaId,
        firstName: apiData.firstName,
        middleName: apiData.middleName,
        lastName: apiData.lastName,
        email: apiData.email,
        phone: apiData.phone,
        profilePictureUrl: apiData.profilePictureUrl,
        location: apiData.location,
        gender: apiData.gender,
        profileData: apiData.smaProfile,
        tier: apiData.tier,
        profileComplete: apiData.profileComplete,
        matchmakerNotes: apiData.matchmakerNotes,
      }
    );

    // Force-clear local fields that syncFromSmaInternal won't overwrite when undefined
    await ctx.runMutation(
      internal.members.mutations.clearProfileFields,
      { smaId: String(args.smaClientId) }
    );

    return {
      fieldsCleared: Object.keys(clearData).length,
      prefsCleared,
      filesDeleted: files.length,
    };
  },
});

/**
 * Background sync all members — scheduled by startSyncAll mutation.
 * Updates the syncJobs record with progress so the UI can track it.
 */
export const syncAllMembersBackground = internalAction({
  args: {
    jobId: v.id("syncJobs"),
  },
  handler: async (ctx, args) => {
    const allMembers = await ctx.runQuery(
      internal.members.queries.listAllInternal,
      {}
    );

    const syncable = allMembers.filter(
      (m: any) => m.smaId && /^\d+$/.test(m.smaId)
    );

    // Set total count
    await ctx.runMutation(internal.members.mutations.updateSyncJobProgress, {
      jobId: args.jobId,
      total: syncable.length,
      progress: 0,
    });

    let synced = 0;
    let errors = 0;

    // SMA rate limits:
    //   /clients/{id}/profile/  → 30 req / 10s (generous)
    //   /clients/{id}/matches/  → 5 req / 10s  (tight bottleneck)
    //
    // Strategy: fetch all profiles first (fast), then rate-limit intro fetches.

    // Phase 1: Fetch & save all profiles (30 req/10s — fine in a tight loop)
    const profileResults: Array<{ member: any; apiData: any }> = [];
    for (const member of syncable) {
      try {
        const smaClientId = Number(member.smaId);
        const apiData = await fetchAndMapClient(smaClientId);
        await ctx.runMutation(
          internal.members.mutations.syncFromSmaInternal,
          {
            smaId: apiData.smaId,
            firstName: apiData.firstName,
            middleName: apiData.middleName,
            lastName: apiData.lastName,
            email: apiData.email,
            phone: apiData.phone,
            profilePictureUrl: apiData.profilePictureUrl,
            location: apiData.location,
            gender: apiData.gender,
            profileData: apiData.smaProfile,
  
            tier: apiData.tier,
            profileComplete: apiData.profileComplete,
            matchmakerNotes: apiData.matchmakerNotes,
          }
        );
        profileResults.push({ member, apiData });
      } catch (err) {
        console.error(`Failed to sync profile for smaId=${member.smaId}:`, err);
        errors++;
      }
    }
    console.log(`Phase 1 done: ${profileResults.length} profiles synced`);

    // Phase 2: Fetch intros with rate limiting (5 req/10s → 2.1s between each)
    const MATCHES_DELAY_MS = 2100;

    for (let i = 0; i < profileResults.length; i++) {
      const { member } = profileResults[i];
      const smaClientId = Number(member.smaId);

      if (i > 0) {
        await new Promise((r) => setTimeout(r, MATCHES_DELAY_MS));
      }

      try {
        const introData = await fetchAndMapIntroductions(
          smaClientId,
          async (smaId: string) => {
            return await ctx.runQuery(internal.members.queries.lookupPartnerNameInternal, { smaId });
          },
        );
        await ctx.runMutation(internal.members.mutations.syncIntrosInternal, {
          memberSmaId: String(smaClientId),
          summary: introData.summary,
          introductions: introData.introductions,
        });
        synced++;
        console.log(`Synced intros ${i + 1}/${profileResults.length}: smaId=${member.smaId} (${introData.summary.total} intros)`);
      } catch (introErr) {
        console.warn(`Failed to sync intros for smaId=${member.smaId}:`, introErr);
        synced++;
      }

      // Update progress after each member
      await ctx.runMutation(internal.members.mutations.updateSyncJobProgress, {
        jobId: args.jobId,
        progress: i + 1,
      });
    }

    // Mark job as completed
    await ctx.runMutation(internal.members.mutations.updateSyncJobProgress, {
      jobId: args.jobId,
      status: "completed",
      progress: profileResults.length,
      result: JSON.stringify({ synced, errors }),
    });

    return { synced, errors };
  },
});

/**
 * Trigger the male-only WhatsApp flow for an existing match.
 * Fetches gender from SMA API if missing, then calls startFlowForMaleMember.
 */
export const triggerMaleFlowForMatch = internalAction({
  args: { matchId: v.id("matches") },
  handler: async (ctx, args) => {
    const match = await ctx.runQuery(internal.matches.queries.getInternal, { matchId: args.matchId });
    if (!match) {
      console.warn(`triggerMaleFlowForMatch: match not found ${args.matchId}`);
      return { triggered: false, reason: "match_not_found" };
    }

    if (match.flowTriggered) {
      return { triggered: false, reason: "already_triggered" };
    }

    // Look up both members
    let memberA = await ctx.runQuery(internal.members.queries.getInternal, { memberId: match.memberAId });
    let memberB = await ctx.runQuery(internal.members.queries.getInternal, { memberId: match.memberBId });

    // If gender missing on either side, try to fetch from SMA API
    if (memberA && !memberA.gender && memberA.smaId && /^\d+$/.test(memberA.smaId)) {
      try {
        const apiData = await fetchAndMapClient(Number(memberA.smaId));
        await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
          smaId: apiData.smaId,
          firstName: apiData.firstName,
          middleName: apiData.middleName,
          lastName: apiData.lastName,
          email: apiData.email,
          phone: apiData.phone,
          profilePictureUrl: apiData.profilePictureUrl,
          location: apiData.location,
          gender: apiData.gender,
          profileData: apiData.smaProfile,

          tier: apiData.tier,
          profileComplete: apiData.profileComplete,
          matchmakerNotes: apiData.matchmakerNotes,
        });
        memberA = await ctx.runQuery(internal.members.queries.getInternal, { memberId: match.memberAId });
      } catch (err) {
        console.warn(`triggerMaleFlowForMatch: failed to fetch gender for memberA smaId=${memberA.smaId}:`, err);
      }
    }

    if (memberB && !memberB.gender && memberB.smaId && /^\d+$/.test(memberB.smaId)) {
      try {
        const apiData = await fetchAndMapClient(Number(memberB.smaId));
        await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
          smaId: apiData.smaId,
          firstName: apiData.firstName,
          middleName: apiData.middleName,
          lastName: apiData.lastName,
          email: apiData.email,
          phone: apiData.phone,
          profilePictureUrl: apiData.profilePictureUrl,
          location: apiData.location,
          gender: apiData.gender,
          profileData: apiData.smaProfile,

          tier: apiData.tier,
          profileComplete: apiData.profileComplete,
          matchmakerNotes: apiData.matchmakerNotes,
        });
        memberB = await ctx.runQuery(internal.members.queries.getInternal, { memberId: match.memberBId });
      } catch (err) {
        console.warn(`triggerMaleFlowForMatch: failed to fetch gender for memberB smaId=${memberB.smaId}:`, err);
      }
    }

    // Check if we now have a male member
    const hasMale = memberA?.gender === "male" || memberB?.gender === "male";
    if (!hasMale) {
      console.warn(`triggerMaleFlowForMatch: still no male member for match ${args.matchId} after API fetch`);
      return { triggered: false, reason: "no_male_after_fetch" };
    }

    // Delegate to the mutation (which re-checks flowTriggered atomically)
    const result = await ctx.runMutation(
      internal.integrations.crm.mutations.startFlowForMaleMember,
      { matchId: args.matchId }
    );

    return { triggered: result.started, reason: result.started ? "ok" : result.reason };
  },
});

/**
 * Trigger flow for an active intro — called by match_group_changed webhook
 * when a match is moved to "Automated Intro" group.
 */
export const triggerFlowForActiveIntro = internalAction({
  args: { smaIntroId: v.string() },
  handler: async (ctx, args) => {
    const match = await ctx.runQuery(internal.matches.queries.getBySmaIntroId, { smaIntroId: args.smaIntroId });
    if (!match) {
      console.warn(`triggerFlowForActiveIntro: no match found for smaIntroId=${args.smaIntroId}`);
      return { triggered: false, reason: "match_not_found" };
    }

    if (match.flowTriggered) {
      return { triggered: false, reason: "already_triggered" };
    }

    return await ctx.runAction(
      internal.integrations.smartmatchapp.actions.triggerMaleFlowForMatch,
      { matchId: match._id }
    );
  },
});

/**
 * Trigger the Post-Date Feedback Flow for both members when a match
 * moves to "Successful Introductions" in SMA.
 */
export const triggerPostDateFeedbackFlow = internalAction({
  args: { smaIntroId: v.string() },
  handler: async (ctx, args) => {
    // Safety filter: only process if test client filtering is active
    const testClientId = process.env.SMA_TEST_CLIENT_ID;
    if (testClientId) {
      const match = await ctx.runQuery(internal.matches.queries.getBySmaIntroId, { smaIntroId: args.smaIntroId });
      if (match) {
        const memberA = await ctx.runQuery(internal.members.queries.getByIdInternal, { memberId: match.memberAId });
        const memberB = await ctx.runQuery(internal.members.queries.getByIdInternal, { memberId: match.memberBId });
        const testIds = new Set(testClientId.split(",").map((id) => parseInt(id.trim(), 10)));
        const smaIdA = memberA?.smaId ? parseInt(memberA.smaId, 10) : NaN;
        const smaIdB = memberB?.smaId ? parseInt(memberB.smaId, 10) : NaN;
        if (!testIds.has(smaIdA) && !testIds.has(smaIdB)) {
          console.log(`triggerPostDateFeedbackFlow skipped: neither member is in test clients [${[...testIds]}]`);
          return { triggered: false, reason: "test_filter" };
        }
      }
    }

    const match = await ctx.runQuery(internal.matches.queries.getBySmaIntroId, { smaIntroId: args.smaIntroId });
    if (!match) {
      console.warn(`triggerPostDateFeedbackFlow: no match found for smaIntroId=${args.smaIntroId}`);
      return { triggered: false, reason: "match_not_found" };
    }

    if (match.feedbackFlowTriggered) {
      return { triggered: false, reason: "already_triggered" };
    }

    const result = await ctx.runMutation(
      internal.integrations.crm.mutations.startFeedbackFlowForBothMembers,
      { matchId: match._id }
    );

    return { triggered: result.started ?? false, ...result };
  },
});

// ── Conversation Log Sync ────────────────────────────────────────────

const CONVERSATION_LOG_PREFIX = "conversation-log-";

/**
 * Export a member's full WhatsApp/SMS conversation history as a text file
 * and upload it to their SMA CRM profile under Files.
 *
 * Uses the same append-and-replace pattern as voice-notes and bot-notes:
 * download existing → combine → delete old → upload new.
 */
export const syncConversationLogToSma = internalAction({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    try {
      const member = await ctx.runQuery(internal.members.queries.getInternal, {
        memberId: args.memberId,
      });
      if (!member) {
        console.warn("[syncConversationLog] Member not found:", args.memberId);
        return;
      }

      const clientSmaId = member.smaId ? parseInt(member.smaId, 10) : NaN;
      if (isNaN(clientSmaId)) {
        console.log("[syncConversationLog] Skipping — member has no numeric smaId");
        return;
      }

      // Fetch full conversation history (high limit to get everything)
      const messages = await ctx.runQuery(
        internal.engine.transitions.getRecentMessages,
        { memberId: args.memberId, limit: 5000 },
      );

      if (!messages || messages.length === 0) {
        console.log("[syncConversationLog] No messages found for member:", member.firstName);
        return;
      }

      // Sort chronologically (getRecentMessages returns desc)
      const sorted = [...messages].sort((a, b) => a.createdAt - b.createdAt);

      // Format as readable conversation log
      const lines: string[] = [];
      lines.push(`Conversation Log: ${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`);
      lines.push(`Total messages: ${sorted.length}`);
      lines.push(`Period: ${new Date(sorted[0].createdAt).toISOString().split("T")[0]} to ${new Date(sorted[sorted.length - 1].createdAt).toISOString().split("T")[0]}`);
      lines.push("═".repeat(50));
      lines.push("");

      let currentDay = "";
      for (const msg of sorted) {
        const msgDate = new Date(msg.createdAt);
        const day = msgDate.toISOString().split("T")[0];
        const time = msgDate.toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
          timeZone: "America/New_York",
        });

        // Add day separator
        if (day !== currentDay) {
          if (currentDay) lines.push("");
          lines.push(`── ${day} ──`);
          currentDay = day;
        }

        const speaker = msg.direction === "inbound" ? member.firstName : "Matcha";
        let content = msg.content || "";

        // Parse interactive messages for readability
        if (msg.messageType === "interactive") {
          try {
            const parsed = JSON.parse(content);
            content = parsed.question || parsed.body || content;
          } catch {
            // keep raw content
          }
        }

        lines.push(`[${time}] ${speaker}: ${content}`);
      }

      lines.push("");
      lines.push("---");
      lines.push("Auto-generated by Club Allenby Bot");

      const fileContent = lines.join("\n");

      // Upload using append-and-replace pattern
      await conversationLogAppendAndReplace(clientSmaId, fileContent);

      console.log(
        `[syncConversationLog] Done for ${member.firstName} (smaId=${clientSmaId}), ${sorted.length} messages`,
      );
    } catch (error: any) {
      console.error("[syncConversationLog] Failed:", error?.message);
    }
  },
});

async function conversationLogAppendAndReplace(
  clientSmaId: number,
  newContent: string,
): Promise<void> {
  // Delete any existing conversation-log files (full replace, not append)
  try {
    const files = await listClientFiles(clientSmaId);
    const logFiles = files.filter(
      (f: any) => f.name && f.name.startsWith(CONVERSATION_LOG_PREFIX),
    );

    for (const oldFile of logFiles) {
      try {
        await deleteClientFile(clientSmaId, oldFile.id);
        console.log(`[conversationLogAppendAndReplace] Deleted old file ${oldFile.id} (${oldFile.name})`);
      } catch (err: any) {
        console.warn(`[conversationLogAppendAndReplace] Failed to delete ${oldFile.id}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.warn("[conversationLogAppendAndReplace] Failed to list files:", err?.message);
  }

  const date = new Date().toISOString().split("T")[0];
  const fileName = `${CONVERSATION_LOG_PREFIX}${date}.txt`;
  await uploadClientFile(clientSmaId, fileName, newContent);
  console.log(`[conversationLogAppendAndReplace] Uploaded ${fileName} for client ${clientSmaId}`);
}
