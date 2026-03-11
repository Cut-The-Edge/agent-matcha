// @ts-nocheck
import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authz";
import { addBusinessDays } from "../lib/businessDays";

// Max leads to process per cron run to avoid hitting mutation limits
const EXPIRE_BATCH_SIZE = 50;

// ── Create from voice call ──────────────────────────────────────────

export const createFromCall = internalMutation({
  args: {
    memberId: v.optional(v.id("members")),
    callId: v.optional(v.id("phoneCalls")),
    tierInterest: v.union(v.literal("member"), v.literal("vip")),
    prospectName: v.string(),
    prospectPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Deduplicate by memberId first
    if (args.memberId) {
      const existing = await ctx.db
        .query("membershipLeads")
        .withIndex("by_member", (q) => q.eq("memberId", args.memberId))
        .filter((q) => q.eq(q.field("status"), "pending"))
        .first();

      if (existing) {
        console.log(
          "[createFromCall] Skipping — pending lead already exists for member:",
          args.memberId
        );
        return existing._id;
      }
    }

    // Fallback: deduplicate by phone number when no memberId
    if (!args.memberId && args.prospectPhone) {
      const existingByPhone = await ctx.db
        .query("membershipLeads")
        .filter((q) =>
          q.and(
            q.eq(q.field("prospectPhone"), args.prospectPhone),
            q.eq(q.field("status"), "pending")
          )
        )
        .first();

      if (existingByPhone) {
        console.log(
          "[createFromCall] Skipping — pending lead already exists for phone:",
          args.prospectPhone
        );
        return existingByPhone._id;
      }
    }

    const now = Date.now();
    const slaDeadline = addBusinessDays(now, 5);

    const leadId = await ctx.db.insert("membershipLeads", {
      memberId: args.memberId,
      callId: args.callId,
      tierInterest: args.tierInterest,
      prospectName: args.prospectName,
      prospectPhone: args.prospectPhone,
      status: "pending",
      createdAt: now,
      slaDeadline,
      whatsappMessageSent: false,
      smaNoteSynced: false,
      updatedAt: now,
    });

    // Audit log
    await ctx.db.insert("auditLogs", {
      action: "membership_lead_created",
      resource: "membershipLeads",
      resourceId: leadId,
      details: JSON.stringify({
        tierInterest: args.tierInterest,
        prospectName: args.prospectName,
        memberId: args.memberId,
        callId: args.callId,
      }),
      createdAt: now,
    });

    console.log(
      "[createFromCall] Created lead %s: %s interested in %s (deadline: %s)",
      leadId,
      args.prospectName,
      args.tierInterest,
      new Date(slaDeadline).toISOString()
    );

    return leadId;
  },
});

// ── Approve ─────────────────────────────────────────────────────────

export const approve = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    leadId: v.id("membershipLeads"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.status !== "pending") {
      throw new Error(
        `This lead has already been ${lead.status}` +
        (lead.resolvedBy ? ` by ${lead.resolvedBy}` : "")
      );
    }

    const now = Date.now();

    await ctx.db.patch(args.leadId, {
      status: "approved",
      resolvedAt: now,
      resolvedBy: admin.name,
      adminNotes: args.adminNotes,
      updatedAt: now,
    });

    // Schedule WhatsApp message
    await ctx.scheduler.runAfter(
      0,
      internal.membershipLeads.actions.sendOutcomeMessage,
      { leadId: args.leadId, outcome: "approved" }
    );

    // Schedule SMA note sync
    await ctx.scheduler.runAfter(
      0,
      internal.membershipLeads.actions.syncLeadToSma,
      { leadId: args.leadId }
    );

    // Schedule SMA profile membership type update
    await ctx.scheduler.runAfter(
      0,
      internal.membershipLeads.actions.updateSmaMembershipType,
      { leadId: args.leadId }
    );

    // Audit log
    await ctx.db.insert("auditLogs", {
      adminId: admin._id,
      action: "membership_lead_approved",
      resource: "membershipLeads",
      resourceId: args.leadId,
      details: JSON.stringify({
        tierInterest: lead.tierInterest,
        prospectName: lead.prospectName,
        adminNotes: args.adminNotes,
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

// ── Deny ────────────────────────────────────────────────────────────

export const deny = mutation({
  args: {
    sessionToken: v.optional(v.string()),
    leadId: v.id("membershipLeads"),
    adminNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAuth(ctx, args.sessionToken);
    const lead = await ctx.db.get(args.leadId);
    if (!lead) throw new Error("Lead not found");
    if (lead.status !== "pending") {
      throw new Error(
        `This lead has already been ${lead.status}` +
        (lead.resolvedBy ? ` by ${lead.resolvedBy}` : "")
      );
    }

    const now = Date.now();

    await ctx.db.patch(args.leadId, {
      status: "denied",
      resolvedAt: now,
      resolvedBy: admin.name,
      adminNotes: args.adminNotes,
      updatedAt: now,
    });

    // Schedule WhatsApp message
    await ctx.scheduler.runAfter(
      0,
      internal.membershipLeads.actions.sendOutcomeMessage,
      { leadId: args.leadId, outcome: "denied" }
    );

    // Schedule SMA note sync
    await ctx.scheduler.runAfter(
      0,
      internal.membershipLeads.actions.syncLeadToSma,
      { leadId: args.leadId }
    );

    // Audit log
    await ctx.db.insert("auditLogs", {
      adminId: admin._id,
      action: "membership_lead_denied",
      resource: "membershipLeads",
      resourceId: args.leadId,
      details: JSON.stringify({
        tierInterest: lead.tierInterest,
        prospectName: lead.prospectName,
        adminNotes: args.adminNotes,
      }),
      createdAt: now,
    });

    return { success: true };
  },
});

// ── Expire overdue (called by cron) ─────────────────────────────────

export const expireOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    const overdue = await ctx.db
      .query("membershipLeads")
      .withIndex("by_slaDeadline", (q) =>
        q.eq("status", "pending").lt("slaDeadline", now)
      )
      .take(EXPIRE_BATCH_SIZE);

    console.log("[expireOverdue] Found %d overdue leads (batch limit %d)", overdue.length, EXPIRE_BATCH_SIZE);

    for (const lead of overdue) {
      await ctx.db.patch(lead._id, {
        status: "expired",
        resolvedAt: now,
        updatedAt: now,
      });

      // Schedule expiry message (distinct from denial)
      await ctx.scheduler.runAfter(
        0,
        internal.membershipLeads.actions.sendOutcomeMessage,
        { leadId: lead._id, outcome: "expired" }
      );

      // Schedule SMA note
      await ctx.scheduler.runAfter(
        0,
        internal.membershipLeads.actions.syncLeadToSma,
        { leadId: lead._id }
      );

      // Audit log
      await ctx.db.insert("auditLogs", {
        action: "membership_lead_expired",
        resource: "membershipLeads",
        resourceId: lead._id,
        details: JSON.stringify({
          tierInterest: lead.tierInterest,
          prospectName: lead.prospectName,
          slaDeadline: lead.slaDeadline,
        }),
        createdAt: now,
      });
    }

    // If we hit the batch limit, schedule another run to process the rest
    if (overdue.length === EXPIRE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.membershipLeads.mutations.expireOverdue, {});
    }

    return { expired: overdue.length };
  },
});

// ── Mark message sent ───────────────────────────────────────────────

export const markMessageSent = internalMutation({
  args: { leadId: v.id("membershipLeads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      whatsappMessageSent: true,
      updatedAt: Date.now(),
    });
  },
});

// ── Mark SMA synced ─────────────────────────────────────────────────

export const markSmaSynced = internalMutation({
  args: { leadId: v.id("membershipLeads") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.leadId, {
      smaNoteSynced: true,
      updatedAt: Date.now(),
    });
  },
});

// ── Log send/sync failure (visible in audit log) ────────────────────

export const logSendFailure = internalMutation({
  args: {
    leadId: v.id("membershipLeads"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      action: "membership_lead_send_failure",
      resource: "membershipLeads",
      resourceId: args.leadId,
      details: JSON.stringify({ reason: args.reason }),
      createdAt: Date.now(),
    });
    console.error("[logSendFailure] Lead %s: %s", args.leadId, args.reason);
  },
});
