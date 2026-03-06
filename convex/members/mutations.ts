// @ts-nocheck
import { mutation, internalMutation, DatabaseWriter } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authz";

async function ensureProfileToken(db: DatabaseWriter, memberId: any): Promise<void> {
  const member = await db.get(memberId);
  if (!member || member.profileToken) return;
  const token = crypto.randomUUID();
  await db.patch(memberId, {
    profileToken: token,
    profileLink: `/intro/${token}`,
  });
}

/**
 * Generate a profileToken + profileLink for a member that doesn't have one.
 */
export const generateProfileToken = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    regenerate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);
    if (args.regenerate) {
      const token = crypto.randomUUID();
      await ctx.db.patch(args.memberId, {
        profileToken: token,
        profileLink: `/intro/${token}`,
      });
    } else {
      await ensureProfileToken(ctx.db, args.memberId);
    }
    const member = await ctx.db.get(args.memberId);
    return { profileLink: member?.profileLink ?? null };
  },
});

/**
 * Create a new member.
 * Required: firstName, phone, smaId.
 * Optional: lastName, email, whatsappId, tier, matchmakerNotes, profileComplete.
 * Auto-sets createdAt, updatedAt, status="active", rejectionCount=0, lastSyncedAt.
 */
export const create = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    smaId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    profileLink: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();

    const memberId = await ctx.db.insert("members", {
      smaId: args.smaId,
      firstName: args.firstName,
      lastName: args.lastName,
      email: args.email,
      phone: args.phone,
      whatsappId: args.whatsappId,
      profileLink: args.profileLink,
      tier: args.tier ?? "free",
      profileComplete: args.profileComplete ?? false,
      matchmakerNotes: args.matchmakerNotes,
      rejectionCount: 0,
      status: "active",
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return memberId;
  },
});

/**
 * Update member fields by ID.
 * Partial update: only provided fields get changed.
 * Always updates updatedAt.
 */
export const update = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    profileLink: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    const updates: Record<string, any> = { updatedAt: Date.now() };

    if (args.firstName !== undefined) updates.firstName = args.firstName;
    if (args.lastName !== undefined) updates.lastName = args.lastName;
    if (args.email !== undefined) updates.email = args.email;
    if (args.phone !== undefined) updates.phone = args.phone;
    if (args.whatsappId !== undefined) updates.whatsappId = args.whatsappId;
    if (args.profileLink !== undefined) updates.profileLink = args.profileLink;
    if (args.tier !== undefined) updates.tier = args.tier;
    if (args.profileComplete !== undefined) updates.profileComplete = args.profileComplete;
    if (args.matchmakerNotes !== undefined) updates.matchmakerNotes = args.matchmakerNotes;

    await ctx.db.patch(args.memberId, updates);
    return args.memberId;
  },
});

/**
 * Change member status (active/paused/recalibrating).
 */
export const updateStatus = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("recalibrating")
    ),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    await ctx.db.patch(args.memberId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return args.memberId;
  },
});

/**
 * Reactivate a recalibrating member: sets status back to "active" and resets rejectionCount to 0.
 */
export const reactivate = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    await ctx.db.patch(args.memberId, {
      status: "active",
      rejectionCount: 0,
      updatedAt: Date.now(),
    });

    return args.memberId;
  },
});

/**
 * Increment rejectionCount for a member.
 * If rejectionCount reaches >= 3, automatically set status to "recalibrating".
 * Internal mutation — called by match processing logic, not directly by the frontend.
 */
export const incrementRejectionCount = internalMutation({
  args: {
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    const newCount = existing.rejectionCount + 1;
    const updates: Record<string, any> = {
      rejectionCount: newCount,
      updatedAt: Date.now(),
    };

    if (newCount >= 3) {
      updates.status = "recalibrating";
    }

    await ctx.db.patch(args.memberId, updates);

    // Schedule async LLM analysis of all rejection conversations
    if (newCount >= 3) {
      await ctx.scheduler.runAfter(0, internal.integrations.openrouter.analyze.analyzeRecalibration, {
        memberId: args.memberId,
      });
    }

    return { memberId: args.memberId, rejectionCount: newCount, recalibrating: newCount >= 3 };
  },
});

/**
 * Upsert a member by smaId (sync from SmartMatchApp).
 * If a member with the given smaId exists, update their fields + lastSyncedAt.
 * If not, create a new member record.
 */
export const syncFromSma = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    smaId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const now = Date.now();

    // Look up existing member by smaId
    const existing = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaId))
      .first();

    if (existing) {
      // Update existing member
      const updates: Record<string, any> = {
        lastSyncedAt: now,
        updatedAt: now,
      };

      if (args.firstName !== undefined) updates.firstName = args.firstName;
      if (args.lastName !== undefined) updates.lastName = args.lastName;
      if (args.email !== undefined) updates.email = args.email;
      if (args.phone !== undefined) updates.phone = args.phone;
      if (args.whatsappId !== undefined) updates.whatsappId = args.whatsappId;
      if (args.tier !== undefined) updates.tier = args.tier;
      if (args.profileComplete !== undefined) updates.profileComplete = args.profileComplete;
      if (args.matchmakerNotes !== undefined) updates.matchmakerNotes = args.matchmakerNotes;

      await ctx.db.patch(existing._id, updates);
      return { memberId: existing._id, action: "updated" as const };
    } else {
      // Create new member
      const memberId = await ctx.db.insert("members", {
        smaId: args.smaId,
        firstName: args.firstName,
        lastName: args.lastName,
        email: args.email,
        phone: args.phone,
        whatsappId: args.whatsappId,
        tier: args.tier ?? "free",
        profileComplete: args.profileComplete ?? false,
        matchmakerNotes: args.matchmakerNotes,
        rejectionCount: 0,
        status: "active",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { memberId, action: "created" as const };
    }
  },
});

/**
 * Soft-delete a member by setting status to "paused".
 * (Schema only supports active/paused/recalibrating, so we use "paused" as the soft-delete state.)
 */
export const deleteMember = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    memberId: v.id("members"),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    const existing = await ctx.db.get(args.memberId);
    if (!existing) {
      throw new Error(`Member not found: ${args.memberId}`);
    }

    await ctx.db.patch(args.memberId, {
      status: "paused",
      updatedAt: Date.now(),
    });

    return args.memberId;
  },
});

/**
 * Upsert a member by smaId — internal version (no auth required).
 * Called by the SMA webhook integration to sync member data.
 */
export const syncFromSmaInternal = internalMutation({
  args: {
    smaId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    middleName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    location: v.optional(v.object({
      country: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zipCode: v.optional(v.string()),
    })),
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"))),
    profileData: v.optional(v.any()),
    tier: v.optional(
      v.union(v.literal("free"), v.literal("member"), v.literal("vip"))
    ),
    profileComplete: v.optional(v.boolean()),
    matchmakerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.smaId))
      .first();

    if (existing) {
      // Partial update — only overwrite fields that have real values (skip empty strings)
      const updates: Record<string, any> = {
        lastSyncedAt: now,
        updatedAt: now,
      };

      if (args.firstName) updates.firstName = args.firstName;
      if (args.lastName !== undefined) updates.lastName = args.lastName;
      if (args.middleName !== undefined) updates.middleName = args.middleName;
      if (args.email !== undefined) updates.email = args.email;
      if (args.phone !== undefined) updates.phone = args.phone;
      if (args.whatsappId !== undefined) updates.whatsappId = args.whatsappId;
      if (args.profilePictureUrl !== undefined) updates.profilePictureUrl = args.profilePictureUrl;
      if (args.location !== undefined) updates.location = args.location;
      if (args.gender !== undefined) updates.gender = args.gender;
      if (args.profileData !== undefined) updates.profileData = args.profileData;
      if (args.tier !== undefined) updates.tier = args.tier;
      if (args.profileComplete !== undefined) updates.profileComplete = args.profileComplete;
      if (args.matchmakerNotes !== undefined) updates.matchmakerNotes = args.matchmakerNotes;

      await ctx.db.patch(existing._id, updates);
      return { memberId: existing._id, action: "updated" as const };
    } else {
      const memberId = await ctx.db.insert("members", {
        smaId: args.smaId,
        firstName: args.firstName || "Unknown",
        middleName: args.middleName,
        lastName: args.lastName,
        email: args.email,
        phone: args.phone,
        whatsappId: args.whatsappId,
        profilePictureUrl: args.profilePictureUrl,
        location: args.location,
        gender: args.gender,
        profileData: args.profileData,
        tier: args.tier ?? "free",
        profileComplete: args.profileComplete ?? false,
        matchmakerNotes: args.matchmakerNotes,
        rejectionCount: 0,
        status: "active",
        lastSyncedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { memberId, action: "created" as const };
    }
  },
});

/**
 * Sync SMA introduction summary + detail records for a member.
 * Deletes old introductions and inserts fresh ones (atomic in Convex).
 */
export const syncIntrosInternal = internalMutation({
  args: {
    memberSmaId: v.string(),
    summary: v.object({
      successful: v.number(),
      active: v.number(),
      potential: v.number(),
      rejected: v.number(),
      past: v.number(),
      automated: v.number(),
      notSuitable: v.number(),
      total: v.number(),
      lastFetchedAt: v.number(),
    }),
    introductions: v.array(v.object({
      smaMatchId: v.number(),
      memberSmaId: v.string(),
      partnerSmaId: v.string(),
      partnerName: v.optional(v.string()),
      group: v.string(),
      groupId: v.number(),
      clientPercent: v.optional(v.number()),
      matchPercent: v.optional(v.number()),
      matchmakerName: v.optional(v.string()),
      smaCreatedDate: v.string(),
      syncedAt: v.number(),
      matchStatus: v.optional(v.string()),
      matchStatusId: v.optional(v.number()),
      clientStatus: v.optional(v.string()),
      clientStatusId: v.optional(v.number()),
      matchPartnerStatus: v.optional(v.string()),
      matchPartnerStatusId: v.optional(v.number()),
      clientPriority: v.optional(v.number()),
      matchPriority: v.optional(v.number()),
      clientDueDate: v.optional(v.string()),
      matchDueDate: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    // Update smaIntroSummary on the member record
    const member = await ctx.db
      .query("members")
      .withIndex("by_smaId", (q) => q.eq("smaId", args.memberSmaId))
      .first();

    if (member) {
      await ctx.db.patch(member._id, {
        smaIntroSummary: args.summary,
        updatedAt: Date.now(),
      });
    }

    // Delete old introductions for this member
    const oldIntros = await ctx.db
      .query("smaIntroductions")
      .withIndex("by_member", (q) => q.eq("memberSmaId", args.memberSmaId))
      .collect();
    for (const old of oldIntros) {
      await ctx.db.delete(old._id);
    }

    // Insert fresh introductions
    for (const intro of args.introductions) {
      await ctx.db.insert("smaIntroductions", intro);
    }

    // Schedule profile fetch for stub member if still "Unknown"
    if (member && member.firstName === "Unknown" && member.smaId) {
      await ctx.scheduler.runAfter(
        0,
        internal.integrations.smartmatchapp.actions.fetchProfile,
        { smaClientId: Number(member.smaId) }
      );
    }

    // Reconcile internal matches table from fresh intro data.
    // Creates matches that don't exist, updates ones that do.
    const GROUP_STATUS_MAP: Record<string, string> = {
      "Active Introductions": "active",
      "Potential Introductions": "pending",
      "Rejected Introductions": "rejected",
      "Not Suitable": "rejected",
      "Past Introductions": "past",
      "Successful Matches": "completed",
      "Automated Intro": "active",
    };
    const TERMINAL_STATUSES = new Set(["completed", "expired", "rejected", "past"]);

    for (const intro of args.introductions) {
      const smaIntroId = String(intro.smaMatchId);
      const match = await ctx.db
        .query("matches")
        .withIndex("by_smaIntroId", (q) => q.eq("smaIntroId", smaIntroId))
        .first();

      if (match) {
        // Update existing match
        const updates: Record<string, any> = { updatedAt: Date.now() };
        if (intro.group) updates.smaGroupName = intro.group;
        if (intro.groupId) updates.smaGroupId = intro.groupId;
        if (intro.matchStatus) updates.smaStatusName = intro.matchStatus;
        if (intro.matchStatusId) updates.smaStatusId = intro.matchStatusId;

        // Auto-map terminal groups to internal match status
        if (intro.group && GROUP_STATUS_MAP[intro.group] && !TERMINAL_STATUSES.has(match.status)) {
          updates.status = GROUP_STATUS_MAP[intro.group];
        }

        await ctx.db.patch(match._id, updates);
      } else if (member) {
        // Create match from SMA intro — look up partner member
        const partner = await ctx.db
          .query("members")
          .withIndex("by_smaId", (q) => q.eq("smaId", intro.partnerSmaId))
          .first();

        if (partner) {
          // De-dup guard: skip if a match between these members already exists
          // (handleMatchAdded may have just created it)
          const existingByMembers = await ctx.db
            .query("matches")
            .withIndex("by_memberA", (q) => q.eq("memberAId", member._id))
            .filter((q) => q.eq(q.field("memberBId"), partner._id))
            .first();
          const existingReverse = !existingByMembers
            ? await ctx.db
                .query("matches")
                .withIndex("by_memberA", (q) => q.eq("memberAId", partner._id))
                .filter((q) => q.eq(q.field("memberBId"), member._id))
                .first()
            : null;
          if (existingByMembers || existingReverse) {
            // Match already exists — update smaIntroId if needed and skip creation
            const existing = existingByMembers || existingReverse;
            if (existing && !existing.smaIntroId) {
              await ctx.db.patch(existing._id, { smaIntroId, updatedAt: Date.now() });
            }
            continue;
          }
          const now = Date.now();
          const status = GROUP_STATUS_MAP[intro.group] ?? "active";
          const introToken = crypto.randomUUID();
          const newMatchId = await ctx.db.insert("matches", {
            smaIntroId,
            memberAId: member._id,
            memberBId: partner._id,
            status: status as any,
            smaGroupId: intro.groupId,
            smaGroupName: intro.group,
            smaStatusName: intro.matchStatus,
            smaStatusId: intro.matchStatusId,
            flowTriggered: false,
            introToken,
            createdAt: now,
            updatedAt: now,
          });

          // Ensure both members have profile tokens
          await ensureProfileToken(ctx.db, member._id);
          await ensureProfileToken(ctx.db, partner._id);

          // Schedule profile fetch for partner if still a stub
          if (partner.firstName === "Unknown" && partner.smaId) {
            await ctx.scheduler.runAfter(
              0,
              internal.integrations.smartmatchapp.actions.fetchProfile,
              { smaClientId: Number(partner.smaId) }
            );
          }

          // Schedule flow trigger for "Automated Intro" matches
          if (intro.group === "Automated Intro") {
            await ctx.scheduler.runAfter(
              0,
              internal.integrations.smartmatchapp.actions.triggerMaleFlowForMatch,
              { matchId: newMatchId }
            );
          }
        }
      }
    }

    // Expire matches that no longer exist in SMA.
    // Any match linked to this member via smaIntroId, where that smaIntroId
    // is NOT in the fresh intro set, should be marked expired.
    if (member) {
      const freshSmaIds = new Set(args.introductions.map((i) => String(i.smaMatchId)));

      // Find all matches where this member is A or B
      const matchesAsA = await ctx.db
        .query("matches")
        .withIndex("by_memberA", (q) => q.eq("memberAId", member._id))
        .collect();
      const matchesAsB = await ctx.db
        .query("matches")
        .withIndex("by_memberB", (q) => q.eq("memberBId", member._id))
        .collect();

      for (const match of [...matchesAsA, ...matchesAsB]) {
        // Expire any SMA-linked match not in the fresh CRM data.
        // CRM is the source of truth — if it's gone from SMA, expire it.
        if (
          match.smaIntroId &&
          !freshSmaIds.has(match.smaIntroId) &&
          match.status !== "expired"
        ) {
          await ctx.db.patch(match._id, {
            status: "expired",
            updatedAt: Date.now(),
          });
        }
      }
    }
  },
});

/**
 * Update an smaIntroductions record directly from a webhook event.
 * Called by match_updated / match_group_changed webhooks for immediate updates
 * (the full re-sync via syncIntrosForMatch is also scheduled but may lag).
 */
export const updateIntroFromSma = internalMutation({
  args: {
    smaMatchId: v.number(),
    // Match-level status (e.g. "Interested", "In Progress")
    matchStatus: v.optional(v.string()),
    matchStatusId: v.optional(v.number()),
    // Group change fields
    group: v.optional(v.string()),
    groupId: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const intros = await ctx.db
      .query("smaIntroductions")
      .withIndex("by_smaMatchId", (q) => q.eq("smaMatchId", args.smaMatchId))
      .collect();

    if (intros.length === 0) {
      console.warn(`updateIntroFromSma: no intro found for smaMatchId=${args.smaMatchId}`);
      return { found: false, count: 0 };
    }

    const updates: Record<string, any> = { syncedAt: Date.now() };
    if (args.matchStatus !== undefined) updates.matchStatus = args.matchStatus;
    if (args.matchStatusId !== undefined) updates.matchStatusId = args.matchStatusId;
    if (args.group !== undefined) updates.group = args.group;
    if (args.groupId !== undefined) updates.groupId = args.groupId;

    for (const intro of intros) {
      await ctx.db.patch(intro._id, updates);
    }

    return { found: true, count: intros.length };
  },
});

/**
 * Store the LLM-generated recalibration summary on a member record.
 * Called by the analyzeRecalibration action after OpenRouter responds.
 */
export const updateRecalibrationSummary = internalMutation({
  args: {
    memberId: v.id("members"),
    recalibrationSummary: v.object({
      summary: v.string(),
      keyPatterns: v.array(v.string()),
      analyzedAt: v.number(),
      feedbackCount: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.memberId, {
      recalibrationSummary: args.recalibrationSummary,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Start a background sync-all job.
 * Creates a syncJobs record and schedules the actual action.
 * Returns immediately so the browser can navigate away.
 */
export const startSyncAll = mutation({
  args: {
    sessionToken: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx, args.sessionToken);

    // Check if there's already a running sync
    const running = await ctx.db
      .query("syncJobs")
      .withIndex("by_type_status", (q) => q.eq("type", "sync_all_members").eq("status", "running"))
      .first();
    if (running) {
      return { jobId: running._id, alreadyRunning: true };
    }

    const jobId = await ctx.db.insert("syncJobs", {
      type: "sync_all_members",
      status: "running",
      progress: 0,
      total: 0,
      startedAt: Date.now(),
    });

    // Schedule the background action
    await ctx.scheduler.runAfter(
      0,
      internal.integrations.smartmatchapp.actions.syncAllMembersBackground,
      { jobId }
    );

    return { jobId, alreadyRunning: false };
  },
});

/**
 * Update sync job progress (called by the background action).
 */
export const updateSyncJobProgress = internalMutation({
  args: {
    jobId: v.id("syncJobs"),
    progress: v.optional(v.number()),
    total: v.optional(v.number()),
    status: v.optional(v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    )),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, any> = {};
    if (args.progress !== undefined) updates.progress = args.progress;
    if (args.total !== undefined) updates.total = args.total;
    if (args.status !== undefined) updates.status = args.status;
    if (args.result !== undefined) updates.result = args.result;
    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = Date.now();
    }
    await ctx.db.patch(args.jobId, updates);
  },
});
