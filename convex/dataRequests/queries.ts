// @ts-nocheck
import { query } from "../_generated/server";
import { v } from "convex/values";
import { requireAuth } from "../auth/authz";
import { getMissingFields } from "./helpers";

export const list = query({
  args: {
    sessionToken: v.optional(v.string()),
    status: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    let requests;
    if (args.status) {
      requests = await ctx.db
        .query("dataRequests")
        .withIndex("by_status", (q) => q.eq("status", args.status as any))
        .collect();
    } else {
      requests = await ctx.db.query("dataRequests").collect();
    }

    // Enrich with member data
    const enriched = await Promise.all(
      requests.map(async (req) => {
        const member = await ctx.db.get(req.memberId);
        return { ...req, member };
      })
    );

    // Filter by search if provided
    if (args.search) {
      const q = args.search.toLowerCase();
      return enriched.filter((r) => {
        if (!r.member) return false;
        const name = `${r.member.firstName} ${r.member.lastName ?? ""}`.toLowerCase();
        const phone = r.member.phone?.toLowerCase() ?? "";
        const email = r.member.email?.toLowerCase() ?? "";
        return name.includes(q) || phone.includes(q) || email.includes(q);
      });
    }

    return enriched;
  },
});

export const getByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db
      .query("dataRequests")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();

    if (!request) return null;

    // Check expiry
    if (request.status === "pending" && request.expiresAt < Date.now()) {
      return { expired: true };
    }

    if (request.status === "expired") {
      return { expired: true };
    }

    // Always allow editing — completed forms can be updated anytime
    const member = await ctx.db.get(request.memberId);
    if (!member) return null;

    return {
      _id: request._id,
      memberId: request.memberId,
      status: request.status,
      allowResubmit: request.status === "completed" ? true : undefined,
      member: {
        firstName: member.firstName,
        lastName: member.lastName,
        email: member.email,
        phone: member.phone,
        profilePictureUrl: member.profilePictureUrl,
        location: member.location,
        profileData: member.profileData,
      },
    };
  },
});

export const getDashboardStats = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMembers = await ctx.db.query("members").collect();
    const totalMembers = allMembers.length;

    let missingDataCount = 0;
    for (const member of allMembers) {
      if (getMissingFields(member).length > 0) {
        missingDataCount++;
      }
    }

    const allRequests = await ctx.db.query("dataRequests").collect();
    const sentCount = allRequests.filter((r) => r.status === "pending").length;
    const completedCount = allRequests.filter((r) => r.status === "completed").length;

    return { totalMembers, missingDataCount, sentCount, completedCount };
  },
});

export const getMembersWithMissingData = query({
  args: { sessionToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const allMembers = await ctx.db.query("members").collect();
    const results = [];

    for (const member of allMembers) {
      const missing = getMissingFields(member);
      if (missing.length === 0) continue;

      // Get latest data request for this member
      const latestRequest = await ctx.db
        .query("dataRequests")
        .withIndex("by_member", (q) => q.eq("memberId", member._id))
        .order("desc")
        .first();

      results.push({
        ...member,
        missingFields: missing,
        latestRequestStatus: latestRequest?.status ?? null,
        latestRequestSentAt: latestRequest?.sentAt ?? null,
        latestRequestToken: latestRequest?.token ?? null,
      });
    }

    return results;
  },
});
