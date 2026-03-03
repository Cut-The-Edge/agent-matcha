import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // -- Auth (from analog) --
  admins: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    role: v.union(v.literal("super_admin"), v.literal("admin")),
    status: v.union(v.literal("active"), v.literal("inactive")),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_email", ["email"]),

  sessions: defineTable({
    adminId: v.id("admins"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
    lastAccessedAt: v.number(),
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
  })
    .index("by_token", ["token"])
    .index("by_admin", ["adminId"]),

  // -- Members (synced from SmartMatchApp) --
  members: defineTable({
    smaId: v.string(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    tier: v.union(
      v.literal("free"),
      v.literal("member"),
      v.literal("vip"),
    ),
    profileComplete: v.boolean(),
    matchmakerNotes: v.optional(v.string()),
    rejectionCount: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("recalibrating"),
    ),
    lastSyncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_smaId", ["smaId"])
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_status", ["status"]),

  // -- Matches --
  matches: defineTable({
    smaIntroId: v.optional(v.string()),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    status: v.union(
      v.literal("pending"),
      v.literal("sent_a"),
      v.literal("sent_b"),
      v.literal("a_interested"),
      v.literal("b_interested"),
      v.literal("mutual_interest"),
      v.literal("group_created"),
      v.literal("a_declined"),
      v.literal("b_declined"),
      v.literal("a_passed"),
      v.literal("b_passed"),
      v.literal("personal_outreach_a"),
      v.literal("personal_outreach_b"),
      v.literal("completed"),
      v.literal("expired"),
    ),
    triggeredBy: v.id("admins"),
    groupChatId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_memberA", ["memberAId"])
    .index("by_memberB", ["memberBId"])
    .index("by_status", ["status"]),

  // -- Feedback --
  feedback: defineTable({
    matchId: v.id("matches"),
    memberId: v.id("members"),
    decision: v.union(
      v.literal("interested"),
      v.literal("not_interested"),
      v.literal("passed"),
    ),
    categories: v.optional(v.array(v.union(
      v.literal("physical_attraction"),
      v.literal("photos_only"),
      v.literal("chemistry"),
      v.literal("willingness_to_meet"),
      v.literal("age_preference"),
      v.literal("location"),
      v.literal("career_income"),
      v.literal("something_specific"),
    ))),
    freeText: v.optional(v.string()),
    voiceNote: v.optional(v.string()),
    smaMatchNotesSynced: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"]),

  // -- Conversations (WhatsApp message log) --
  whatsappMessages: defineTable({
    matchId: v.optional(v.id("matches")),
    memberId: v.id("members"),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    messageType: v.union(
      v.literal("text"),
      v.literal("interactive"),
      v.literal("template"),
      v.literal("media"),
    ),
    content: v.string(),
    twilioSid: v.optional(v.string()),
    status: v.union(
      v.literal("sent"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed"),
    ),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"])
    .index("by_created", ["createdAt"]),

  // -- Payments --
  payments: defineTable({
    matchId: v.id("matches"),
    memberId: v.id("members"),
    type: v.literal("personal_outreach"),
    amount: v.number(),
    phase: v.union(
      v.literal("initial"),
      v.literal("completion"),
    ),
    stripeSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"]),

  // -- Audit Log --
  auditLogs: defineTable({
    adminId: v.optional(v.id("admins")),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),
});
