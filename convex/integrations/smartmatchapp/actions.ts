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
import { fetchAndMapClient } from "./contacts";

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

    // Create stub members if not found (defensive — client_created should have run first)
    if (!memberA) {
      console.warn(`SMA match_added: member A (smaId=${smaIdA}) not found, creating stub`);
      const result = await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
        smaId: smaIdA,
        firstName: "Unknown",
      });
      memberA = await ctx.runQuery(internal.members.queries.getBySmaIdInternal, { smaId: smaIdA });
    }

    if (!memberB) {
      console.warn(`SMA match_added: member B (smaId=${smaIdB}) not found, creating stub`);
      const result = await ctx.runMutation(internal.members.mutations.syncFromSmaInternal, {
        smaId: smaIdB,
        firstName: "Unknown",
      });
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

    return { memberId: result.memberId, action: result.action };
  },
});

/**
 * Sync all members with numeric SMA IDs from the SMA API.
 * Callable from the frontend (user-facing action).
 */
export const syncAllMembers = action({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx) => {
    const allMembers = await ctx.runQuery(
      internal.members.queries.listAllInternal,
      {}
    );

    // Only sync members with numeric smaIds (not "test-xxx" stubs)
    const syncable = allMembers.filter(
      (m: any) => m.smaId && /^\d+$/.test(m.smaId)
    );

    let synced = 0;
    let errors = 0;

    for (const member of syncable) {
      try {
        const apiData = await fetchAndMapClient(Number(member.smaId));
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
        synced++;
      } catch (err) {
        console.error(
          `Failed to sync member smaId=${member.smaId}:`,
          err
        );
        errors++;
      }
    }

    return { synced, errors };
  },
});
