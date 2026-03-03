// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    let matchesQuery = ctx.db.query("matches");

    if (args.status) {
      matchesQuery = matchesQuery.withIndex("by_status", (q) =>
        q.eq("status", args.status as any)
      );
    }

    const matches = await matchesQuery.order("desc").collect();

    // Resolve member names and admin name for each match
    const enriched = await Promise.all(
      matches.map(async (match) => {
        const [memberA, memberB, admin] = await Promise.all([
          ctx.db.get(match.memberAId),
          ctx.db.get(match.memberBId),
          ctx.db.get(match.triggeredBy),
        ]);

        return {
          ...match,
          memberAName: memberA
            ? `${memberA.firstName}${memberA.lastName ? ` ${memberA.lastName}` : ""}`
            : "Unknown",
          memberBName: memberB
            ? `${memberB.firstName}${memberB.lastName ? ` ${memberB.lastName}` : ""}`
            : "Unknown",
          triggeredByName: admin?.name ?? "Unknown",
        };
      })
    );

    return enriched;
  },
});

export const get = query({
  args: {
    sessionToken: v.optional(v.string()),
    matchId: v.id("matches"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const match = await ctx.db.get(args.matchId);
    if (!match) return null;

    const [memberA, memberB, admin] = await Promise.all([
      ctx.db.get(match.memberAId),
      ctx.db.get(match.memberBId),
      ctx.db.get(match.triggeredBy),
    ]);

    return {
      ...match,
      memberAName: memberA
        ? `${memberA.firstName}${memberA.lastName ? ` ${memberA.lastName}` : ""}`
        : "Unknown",
      memberBName: memberB
        ? `${memberB.firstName}${memberB.lastName ? ` ${memberB.lastName}` : ""}`
        : "Unknown",
      triggeredByName: admin?.name ?? "Unknown",
    };
  },
});
