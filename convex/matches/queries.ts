// @ts-nocheck
import { query, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";

/**
 * Helper: format a member's full name from their document.
 */
function formatMemberName(member: any): string {
  if (!member) return "Unknown";
  return `${member.firstName}${member.lastName ? ` ${member.lastName}` : ""}`;
}

/**
 * List matches with optional filters (status, memberId).
 * Includes resolved member names and admin name for each match.
 */
export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(v.string()),
    memberId: v.optional(v.id("members")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 200;

    let matches;

    if (args.status) {
      matches = await ctx.db
        .query("matches")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .order("desc")
        .collect();
    } else if (args.memberId) {
      // Get matches where member is either A or B
      const asA = await ctx.db
        .query("matches")
        .withIndex("by_memberA", (q) => q.eq("memberAId", args.memberId!))
        .order("desc")
        .collect();

      const asB = await ctx.db
        .query("matches")
        .withIndex("by_memberB", (q) => q.eq("memberBId", args.memberId!))
        .order("desc")
        .collect();

      // Merge and sort by createdAt desc
      matches = [...asA, ...asB].sort((a, b) => b.createdAt - a.createdAt);
    } else {
      matches = await ctx.db.query("matches").order("desc").collect();
    }

    // Apply limit
    matches = matches.slice(0, limit);

    // Resolve member names and admin name for each match
    const enriched = await Promise.all(
      matches.map(async (match) => {
        const [memberA, memberB, admin] = await Promise.all([
          ctx.db.get(match.memberAId),
          ctx.db.get(match.memberBId),
          match.triggeredBy ? ctx.db.get(match.triggeredBy) : null,
        ]);

        // Fallback: if no admin, look up matchmaker from SMA intro
        let triggeredByName = admin?.name ?? null;
        if (!triggeredByName && match.smaIntroId) {
          const intro = await ctx.db
            .query("smaIntroductions")
            .withIndex("by_smaMatchId", (q) => q.eq("smaMatchId", Number(match.smaIntroId)))
            .first();
          if (intro?.matchmakerName) triggeredByName = intro.matchmakerName;
        }

        // Resolve "Unknown" names from SMA intro partnerName
        let memberAName = formatMemberName(memberA);
        let memberBName = formatMemberName(memberB);
        if (memberAName === "Unknown" && memberA?.smaId) {
          const ref = await ctx.db
            .query("smaIntroductions")
            .filter((q) => q.eq(q.field("partnerSmaId"), memberA.smaId))
            .first();
          if (ref?.partnerName && ref.partnerName !== "Unknown") memberAName = ref.partnerName;
        }
        if (memberBName === "Unknown" && memberB?.smaId) {
          const ref = await ctx.db
            .query("smaIntroductions")
            .filter((q) => q.eq(q.field("partnerSmaId"), memberB.smaId))
            .first();
          if (ref?.partnerName && ref.partnerName !== "Unknown") memberBName = ref.partnerName;
        }

        return {
          ...match,
          memberAName,
          memberBName,
          triggeredByName: triggeredByName ?? "System",
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single match by ID with full member details for both parties.
 */
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
      match.triggeredBy ? ctx.db.get(match.triggeredBy) : null,
    ]);

    // Get feedback for this match
    const feedbackEntries = await ctx.db
      .query("feedback")
      .withIndex("by_match", (q) => q.eq("matchId", args.matchId))
      .collect();

    // Fallback for triggeredByName: if no admin, look up matchmaker from SMA intro
    let triggeredByName = admin?.name ?? null;
    if (!triggeredByName && match.smaIntroId) {
      const intro = await ctx.db
        .query("smaIntroductions")
        .withIndex("by_smaMatchId", (q) => q.eq("smaMatchId", Number(match.smaIntroId)))
        .first();
      if (intro?.matchmakerName) {
        triggeredByName = intro.matchmakerName;
      }
    }

    // Resolve "Unknown" member names from SMA intro partnerName
    let memberAName = formatMemberName(memberA);
    let memberBName = formatMemberName(memberB);

    if (memberAName === "Unknown" && memberA?.smaId) {
      // Look for intros where this member is the partner
      const refIntro = await ctx.db
        .query("smaIntroductions")
        .filter((q) => q.eq(q.field("partnerSmaId"), memberA.smaId))
        .first();
      if (refIntro?.partnerName && refIntro.partnerName !== "Unknown") {
        memberAName = refIntro.partnerName;
      }
    }
    if (memberBName === "Unknown" && memberB?.smaId) {
      const refIntro = await ctx.db
        .query("smaIntroductions")
        .filter((q) => q.eq(q.field("partnerSmaId"), memberB.smaId))
        .first();
      if (refIntro?.partnerName && refIntro.partnerName !== "Unknown") {
        memberBName = refIntro.partnerName;
      }
    }

    return {
      ...match,
      memberA: memberA
        ? {
            _id: memberA._id,
            smaId: memberA.smaId,
            firstName: memberAName.split(" ")[0] || memberA.firstName,
            lastName: memberAName.split(" ").slice(1).join(" ") || memberA.lastName,
            email: memberA.email,
            phone: memberA.phone,
            tier: memberA.tier,
            status: memberA.status,
          }
        : null,
      memberB: memberB
        ? {
            _id: memberB._id,
            smaId: memberB.smaId,
            firstName: memberBName.split(" ")[0] || memberB.firstName,
            lastName: memberBName.split(" ").slice(1).join(" ") || memberB.lastName,
            email: memberB.email,
            phone: memberB.phone,
            tier: memberB.tier,
            status: memberB.status,
          }
        : null,
      memberAName,
      memberBName,
      triggeredByName: triggeredByName ?? "System",
      feedback: feedbackEntries,
    };
  },
});

/**
 * Find a match between two specific members (in either direction).
 */
export const getByMembers = query({
  args: {
    sessionToken: v.optional(v.string()),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Check A -> B direction
    const matchAB = await ctx.db
      .query("matches")
      .withIndex("by_memberA", (q) => q.eq("memberAId", args.memberAId))
      .filter((q) => q.eq(q.field("memberBId"), args.memberBId))
      .first();

    if (matchAB) return matchAB;

    // Check B -> A direction
    const matchBA = await ctx.db
      .query("matches")
      .withIndex("by_memberA", (q) => q.eq("memberAId", args.memberBId))
      .filter((q) => q.eq(q.field("memberBId"), args.memberAId))
      .first();

    return matchBA;
  },
});

/**
 * Get all active (non-terminal) matches.
 * Terminal statuses: completed, expired, rejected, past.
 */
export const getActive = query({
  args: {
    sessionToken: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const limit = args.limit ?? 200;
    const terminalStatuses = new Set([
      "completed",
      "expired",
      "rejected",
      "past",
    ]);

    const allMatches = await ctx.db.query("matches").order("desc").collect();

    const activeMatches = allMatches
      .filter((m) => !terminalStatuses.has(m.status))
      .slice(0, limit);

    // Resolve member names
    const enriched = await Promise.all(
      activeMatches.map(async (match) => {
        const [memberA, memberB] = await Promise.all([
          ctx.db.get(match.memberAId),
          ctx.db.get(match.memberBId),
        ]);

        return {
          ...match,
          memberAName: formatMemberName(memberA),
          memberBName: formatMemberName(memberB),
        };
      })
    );

    return enriched;
  },
});

/**
 * Get match statistics:
 * - counts by status
 * - response rate (how many matches got at least one response vs total)
 * - average time to first response
 */
export const getStats = query({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMatches = await ctx.db.query("matches").collect();

    const byStatus: Record<string, number> = {};
    let respondedCount = 0;
    let completedCount = 0;
    const responseTimes: number[] = [];

    const respondedStatuses = new Set([
      "rejected",
      "past",
      "pending",
      "completed",
    ]);

    for (const match of allMatches) {
      byStatus[match.status] = (byStatus[match.status] ?? 0) + 1;

      if (respondedStatuses.has(match.status)) {
        respondedCount++;
      }

      if (match.status === "completed") {
        completedCount++;
      }

      // Compute response time: time from creation to first update (approximation)
      if (respondedStatuses.has(match.status) && match.updatedAt > match.createdAt) {
        responseTimes.push(match.updatedAt - match.createdAt);
      }
    }

    const total = allMatches.length;
    const responseRate = total > 0 ? respondedCount / total : 0;
    const avgResponseTimeMs =
      responseTimes.length > 0
        ? responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length
        : 0;

    return {
      total,
      byStatus,
      respondedCount,
      completedCount,
      responseRate: Math.round(responseRate * 100) / 100,
      avgResponseTimeMs: Math.round(avgResponseTimeMs),
      avgResponseTimeHours: Math.round(avgResponseTimeMs / (1000 * 60 * 60) * 10) / 10,
    };
  },
});

/**
 * Get a match by ID (no auth — internal use only).
 */
export const getInternal = internalQuery({
  args: { matchId: v.id("matches") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.matchId);
  },
});

/**
 * Look up a match by its SMA introduction ID (no auth — internal use only).
 */
export const getBySmaIntroId = internalQuery({
  args: { smaIntroId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("matches")
      .withIndex("by_smaIntroId", (q) => q.eq("smaIntroId", args.smaIntroId))
      .first();
  },
});

/**
 * Public query: look up a match by introToken and return the female member's
 * profile data for the public profile page. No auth required — the token
 * itself is the authorization.
 *
 * Returns only safe-to-share fields (no email, phone, last name, etc.)
 */
/**
 * Build safe-to-share profile data from a member document.
 */
function buildProfileResponse(member: any) {
  const profile = member.profileData ?? {};
  return {
    firstName: member.firstName,
    age: profile.age,
    birthdate: profile.birthdate,
    location: member.location,
    profilePictureUrl: member.profilePictureUrl,
    coverPhotoUrl: typeof profile.coverPhoto === "object" ? profile.coverPhoto?.url : profile.coverPhoto,
    occupation: profile.occupation,
    careerOverview: profile.careerOverview,
    religion: profile.religion,
    jewishObservance: profile.jewishObservance,
    ethnicity: profile.ethnicity,
    politicalAffiliation: profile.politicalAffiliation,
    interests: profile.interests,
    currentRelationshipStatus: profile.currentRelationshipStatus,
    dayInLife: profile.dayInLife,
    weekendPreferences: profile.weekendPreferences,
    friendsDescribe: profile.friendsDescribe,
    upbringing: profile.upbringing,
    relationshipStatus: profile.relationshipStatus,
    relationshipHistory: profile.relationshipHistory,
    hasChildren: profile.hasChildren,
    wantChildren: profile.wantChildren,
    childrenDetails: profile.childrenDetails,
    height: profile.height,
    languages: profile.languages,
  };
}

export const getProfileByIntroToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // 1. Try match introToken (time-limited intro link)
    const match = await ctx.db
      .query("matches")
      .withIndex("by_introToken", (q) => q.eq("introToken", args.token))
      .first();

    if (match) {
      // Check expiration
      const settings = await ctx.db.query("appSettings").first();
      const expirationHours = settings?.profileExpirationHours ?? 24;
      const expiresAt = match.createdAt + expirationHours * 60 * 60 * 1000;
      if (Date.now() > expiresAt) {
        return { expired: true as const };
      }

      // Find the female member (check both sides)
      const memberA = await ctx.db.get(match.memberAId);
      const memberB = await ctx.db.get(match.memberBId);

      const femaleMember =
        memberA?.gender === "female" ? memberA :
        memberB?.gender === "female" ? memberB :
        memberB;

      if (!femaleMember) return null;
      return buildProfileResponse(femaleMember);
    }

    // 2. Try member profileToken (permanent member profile link)
    const member = await ctx.db
      .query("members")
      .withIndex("by_profileToken", (q) => q.eq("profileToken", args.token))
      .first();

    if (!member) return null;
    return buildProfileResponse(member);
  },
});
