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
    middleName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    whatsappId: v.optional(v.string()),
    profileLink: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    location: v.optional(v.object({
      country: v.optional(v.string()),
      city: v.optional(v.string()),
      state: v.optional(v.string()),
      zipCode: v.optional(v.string()),
    })),
    tier: v.union(
      v.literal("free"),
      v.literal("member"),
      v.literal("vip"),
    ),
    profileComplete: v.boolean(),
    matchmakerNotes: v.optional(v.string()),
    rejectionCount: v.number(),
    recalibrationSummary: v.optional(v.object({
      summary: v.string(),
      keyPatterns: v.array(v.string()),
      analyzedAt: v.number(),
      feedbackCount: v.number(),
    })),
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
    .index("by_whatsappId", ["whatsappId"])
    .index("by_status", ["status"]),

  // -- Matches (§7.1 Match Status Values) --
  matches: defineTable({
    smaIntroId: v.optional(v.string()),
    memberAId: v.id("members"),
    memberBId: v.id("members"),
    // §7.1: active (sent, awaiting), rejected (Flow B), past (Flow C→No), pending (Flow C→Yes paid)
    status: v.union(
      v.literal("active"),
      v.literal("rejected"),
      v.literal("past"),
      v.literal("pending"),
      v.literal("completed"),
      v.literal("expired"),
    ),
    // §7.2: what the member responded
    responseType: v.optional(v.union(
      v.literal("interested"),
      v.literal("not_interested"),
      v.literal("upsell_yes"),
      v.literal("upsell_no_interested"),
      v.literal("upsell_no_pass"),
      v.literal("no_response"),
    )),
    // §7.2: structured notes written by the flow
    matchNotes: v.optional(v.any()),
    triggeredBy: v.optional(v.id("admins")),
    // SMA group/status sync
    smaGroupId: v.optional(v.number()),
    smaGroupName: v.optional(v.string()),
    smaStatusId: v.optional(v.number()),
    smaStatusName: v.optional(v.string()),
    groupChatId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_memberA", ["memberAId"])
    .index("by_memberB", ["memberBId"])
    .index("by_status", ["status"])
    .index("by_smaIntroId", ["smaIntroId"]),

  // -- Feedback --
  feedback: defineTable({
    matchId: v.id("matches"),
    memberId: v.id("members"),
    flowInstanceId: v.optional(v.id("flowInstances")),
    decision: v.string(),
    // Primary reasons selected (e.g. "physical", "location", "bio")
    categories: v.optional(v.array(v.string())),
    // Sub-category selections keyed by primary reason
    // e.g. { "location": "Too far for me right now", "physical": "Somewhat" }
    subCategories: v.optional(v.any()),
    freeText: v.optional(v.string()),
    voiceNote: v.optional(v.string()),
    // Raw responses from flow context for full audit trail
    rawResponses: v.optional(v.any()),
    llmAnalysis: v.optional(v.any()),
    smaMatchNotesSynced: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"])
    .index("by_flowInstance", ["flowInstanceId"]),

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
    mediaUrl: v.optional(v.string()),
    mediaContentType: v.optional(v.string()),
    transcription: v.optional(v.string()),
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
    flowInstanceId: v.optional(v.id("flowInstances")),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("refunded"),
      v.literal("cancelled"),
    ),
    createdAt: v.number(),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"])
    .index("by_flowInstance", ["flowInstanceId"])
    .index("by_stripeSession", ["stripeSessionId"]),

  // -- Audit Log --
  auditLogs: defineTable({
    adminId: v.optional(v.id("admins")),
    action: v.string(),
    resource: v.string(),
    resourceId: v.optional(v.string()),
    details: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_created", ["createdAt"]),

  // -- Phone Calls --
  phoneCalls: defineTable({
    livekitRoomId: v.string(),
    sipCallId: v.optional(v.string()),
    memberId: v.optional(v.id("members")),
    phone: v.optional(v.string()),
    direction: v.union(v.literal("inbound"), v.literal("outbound")),
    status: v.union(
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("transferred"),
      v.literal("failed"),
      v.literal("no_answer"),
    ),
    duration: v.optional(v.number()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    transcript: v.optional(v.any()),
    aiSummary: v.optional(v.any()),
    extractedData: v.optional(v.any()),
    profileAction: v.optional(
      v.union(
        v.literal("created"),
        v.literal("updated"),
        v.literal("none"),
      )
    ),
    sandbox: v.optional(v.boolean()),
    egressId: v.optional(v.string()),
    smaSyncStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("synced"),
        v.literal("failed"),
        v.literal("skipped"),
      )
    ),
    qualityFlags: v.optional(v.array(v.string())),
    escalationReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_room", ["livekitRoomId"])
    .index("by_member", ["memberId"])
    .index("by_phone", ["phone"])
    .index("by_status", ["status"])
    .index("by_created", ["createdAt"]),

  callTranscriptSegments: defineTable({
    callId: v.id("phoneCalls"),
    speaker: v.union(v.literal("caller"), v.literal("agent")),
    text: v.string(),
    timestamp: v.number(),
    confidence: v.optional(v.number()),
  })
    .index("by_call", ["callId"])
    .index("by_timestamp", ["callId", "timestamp"]),

  // -- Flow Engine: Definitions --
  flowDefinitions: defineTable({
    name: v.string(),
    type: v.string(),
    description: v.optional(v.string()),
    nodes: v.array(
      v.object({
        nodeId: v.string(),
        type: v.string(),
        label: v.string(),
        position: v.object({ x: v.number(), y: v.number() }),
        config: v.any(),
      })
    ),
    edges: v.array(
      v.object({
        edgeId: v.string(),
        source: v.string(),
        target: v.string(),
        label: v.optional(v.string()),
        condition: v.optional(v.string()),
      })
    ),
    version: v.number(),
    isActive: v.boolean(),
    isDefault: v.boolean(),
    createdBy: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_type", ["type"])
    .index("by_active", ["type", "isActive"]),

  // -- Flow Engine: Instances --
  flowInstances: defineTable({
    flowDefinitionId: v.id("flowDefinitions"),
    matchId: v.optional(v.id("matches")),
    memberId: v.optional(v.id("members")),
    currentNodeId: v.string(),
    status: v.string(),
    context: v.any(),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
    lastTransitionAt: v.number(),
    error: v.optional(v.string()),
    schedulerJobId: v.optional(v.id("_scheduled_functions")),
  })
    .index("by_match", ["matchId"])
    .index("by_member", ["memberId"])
    .index("by_status", ["status"])
    .index("by_flow", ["flowDefinitionId"]),

  // -- Flow Engine: Execution Logs --
  flowExecutionLogs: defineTable({
    instanceId: v.id("flowInstances"),
    nodeId: v.string(),
    nodeType: v.string(),
    action: v.string(),
    input: v.optional(v.string()),
    output: v.optional(v.string()),
    duration: v.optional(v.number()),
    timestamp: v.number(),
  })
    .index("by_instance", ["instanceId"])
    .index("by_timestamp", ["timestamp"]),
});
