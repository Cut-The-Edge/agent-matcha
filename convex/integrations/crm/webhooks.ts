// @ts-nocheck
/**
 * CRM Match-Created Webhook
 *
 * POST /crm/match-created
 *
 * Receives match creation events from the CRM (SmartMatchApp).
 * Creates/looks up members and matches, then starts a flow instance
 * from the active match_feedback flow definition.
 *
 * This is the trigger mechanism that starts the WhatsApp bot conversation
 * when a new match is created in the CRM.
 */

import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

export const crmMatchCreatedHandler = httpAction(async (ctx, request) => {
  try {
    const body = await request.json();

    const {
      matchId: smaMatchId,
      memberAId: smaIdA,
      memberBId: smaIdB,
      memberAName,
      memberBName,
      profileLinkA,
      profileLinkB,
    } = body;

    if (!smaIdA || !smaIdB) {
      return new Response(
        JSON.stringify({ error: "Missing memberAId or memberBId" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Look up or verify members exist
    const result = await ctx.runMutation(
      internal.integrations.crm.mutations.processMatchCreated,
      {
        smaMatchId: smaMatchId || undefined,
        smaIdA,
        smaIdB,
        memberAName: memberAName || undefined,
        memberBName: memberBName || undefined,
        profileLinkA: profileLinkA || undefined,
        profileLinkB: profileLinkB || undefined,
      }
    );

    return new Response(
      JSON.stringify({
        ok: true,
        matchId: result.matchId,
        flowInstancesStarted: result.flowInstancesStarted,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("CRM webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error processing match" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
