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
import { getClientMatches, smaGet } from "./client";

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
      const testId = parseInt(testClientId, 10);
      if (args.clientId !== testId && args.matchId !== testId) {
        console.log(
          `SMA match_added skipped: neither client ${args.clientId} nor match ${args.matchId} is test client ${testId}`
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
    // Safety filter: only process if this is the test client
    const testClientId = process.env.SMA_TEST_CLIENT_ID;
    if (testClientId) {
      const testId = parseInt(testClientId, 10);
      if (args.smaClientId !== testId) {
        console.log(
          `SMA ${args.event} skipped: client ${args.smaClientId} is not test client ${testId}`
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

    let syncData: Record<string, any> = { ...mapped };

    // API fallback: fetch full profile if member is new or has placeholder data
    if (needsFullProfile) {
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
 * Sync introductions for a single member by SMA client ID.
 * Used by webhooks to auto-refresh intro data when matches change.
 */
export const syncMemberIntros = internalAction({
  args: { smaClientId: v.number() },
  handler: async (ctx, args) => {
    const introData = await fetchAndMapIntroductions(
      args.smaClientId,
      async (smaId: string) => {
        const m = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId });
        return m && m.firstName && m.firstName !== "Unknown"
          ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ""}`
          : null;
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
          const m = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId });
          return m && m.firstName && m.firstName !== "Unknown"
            ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ""}`
            : null;
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
            const m = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId });
            return m && m.firstName && m.firstName !== "Unknown"
              ? `${m.firstName}${m.lastName ? ` ${m.lastName}` : ""}`
              : null;
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
