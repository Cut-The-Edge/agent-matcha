import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // -- Auth (from analog) --
  admins: defineTable({
    email: v.string(),
    passwordHash: v.string(),
    name: v.string(),
    role: v.union(v.literal("developer"), v.literal("super_admin"), v.literal("admin")),
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
    profileToken: v.optional(v.string()),
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
    gender: v.optional(v.union(v.literal("male"), v.literal("female"), v.literal("other"))),
    profileData: v.optional(v.any()),
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
    smaIntroSummary: v.optional(v.object({
      successful: v.number(),
      active: v.number(),
      potential: v.number(),
      rejected: v.number(),
      past: v.number(),
      automated: v.number(),
      notSuitable: v.number(),
      total: v.number(),
      lastFetchedAt: v.number(),
    })),
    lastSyncedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_smaId", ["smaId"])
    .index("by_phone", ["phone"])
    .index("by_email", ["email"])
    .index("by_whatsappId", ["whatsappId"])
    .index("by_profileToken", ["profileToken"])
    .index("by_status", ["status"]),

  // -- SMA Introductions (cached from SMA CRM) --
  smaIntroductions: defineTable({
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
    // Enriched match detail fields from SMA CRM
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
  })
    .index("by_member", ["memberSmaId"])
    .index("by_smaMatchId", ["smaMatchId"])
    .index("by_partnerSmaId", ["partnerSmaId"]),

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
    flowTriggered: v.optional(v.boolean()),
    introToken: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_memberA", ["memberAId"])
    .index("by_memberB", ["memberBId"])
    .index("by_status", ["status"])
    .index("by_smaIntroId", ["smaIntroId"])
    .index("by_introToken", ["introToken"]),

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
    audioDuration: v.optional(v.number()),
    transcriptionConfidence: v.optional(v.number()),
    transcriptionSummary: v.optional(v.string()),
    reviewFlag: v.optional(v.union(v.literal("low_confidence"), v.literal("long_note"))),
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

  // -- Voice Note Batches (sequential voice note grouping) --
  voiceNoteBatches: defineTable({
    memberId: v.id("members"),
    messageIds: v.array(v.id("whatsappMessages")),
    status: v.union(v.literal("collecting"), v.literal("routed")),
    schedulerJobId: v.optional(v.id("_scheduled_functions")),
    createdAt: v.number(),
    routedAt: v.optional(v.number()),
  })
    .index("by_member_status", ["memberId", "status"]),

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

  // -- Sync Jobs (background sync tracking) --
  syncJobs: defineTable({
    type: v.string(),
    status: v.union(
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    progress: v.optional(v.number()),
    total: v.optional(v.number()),
    result: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_type_status", ["type", "status"]),

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

  // -- Data Requests (member profile completion forms) --
  dataRequests: defineTable({
    memberId: v.id("members"),
    token: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("expired"),
    ),
    sentBy: v.union(
      v.literal("manual"),
      v.literal("bulk"),
      v.literal("automation"),
      v.literal("voice_agent"),
    ),
    sentByAdminId: v.optional(v.id("admins")),
    whatsappMessageId: v.optional(v.id("whatsappMessages")),
    completedAt: v.optional(v.number()),
    expiresAt: v.number(),
    submittedData: v.optional(v.any()),
    missingFieldsAtSend: v.optional(v.array(v.string())),
    sentAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_member", ["memberId"])
    .index("by_token", ["token"])
    .index("by_status", ["status"])
    .index("by_expiresAt", ["expiresAt"]),

  // -- App Settings (singleton) --
  appSettings: defineTable({
    profileExpirationHours: v.number(),
    autoSyncCallsToCrm: v.optional(v.boolean()),
    dataRequestExpirationHours: v.optional(v.number()),
    dataRequestAutoSendEnabled: v.optional(v.boolean()),
    dataRequestAutoSendDelayDays: v.optional(v.number()),
    dataRequestAllowResubmit: v.optional(v.boolean()),
    updatedAt: v.number(),
  }),

  // -- Membership/VIP Leads --
  membershipLeads: defineTable({
    memberId: v.optional(v.id("members")),
    callId: v.optional(v.id("phoneCalls")),
    tierInterest: v.union(v.literal("member"), v.literal("vip")),
    prospectName: v.string(),
    prospectPhone: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("denied"),
      v.literal("expired"),
    ),
    createdAt: v.number(),
    slaDeadline: v.number(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.string()),
    adminNotes: v.optional(v.string()),
    whatsappMessageSent: v.boolean(),
    smaNoteSynced: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_member", ["memberId"])
    .index("by_slaDeadline", ["status", "slaDeadline"]),

  // -- Token Usage Analytics --
  tokenUsage: defineTable({
    processType: v.union(
      v.literal("voice-intake"),
      v.literal("summarization"),
      v.literal("whatsapp-feedback"),
      v.literal("whatsapp-intro"),
      v.literal("whatsapp-personalization"),
      v.literal("whatsapp-classification"),
      v.literal("whatsapp-followup"),
      v.literal("feedback-analysis"),
      v.literal("recalibration-analysis"),
      v.literal("other"),
    ),
    provider: v.union(
      v.literal("openai"),
      v.literal("anthropic"),
      v.literal("openrouter"),
      v.literal("google"),
      v.literal("other"),
    ),
    model: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    totalTokens: v.number(),
    costUsd: v.number(),
    latencyMs: v.optional(v.number()),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_processType", ["processType"])
    .index("by_provider", ["provider"])
    .index("by_model", ["model"])
    .index("by_created", ["createdAt"])
    .index("by_entityType", ["entityType", "entityId"]),

  // -- Model Pricing (for cost calculations) --
  modelPricing: defineTable({
    provider: v.string(),
    model: v.string(),
    inputPricePerMillion: v.number(),
    outputPricePerMillion: v.number(),
    effectiveDate: v.number(),
    sourceUrl: v.optional(v.string()),
    lastSyncedAt: v.number(),
  })
    .index("by_provider_model", ["provider", "model"])
    .index("by_model", ["model"]),

  // -- Escalations (items needing Dani's attention) --
  escalations: defineTable({
    memberId: v.id("members"),
    matchId: v.optional(v.id("matches")),
    flowInstanceId: v.optional(v.id("flowInstances")),
    issueType: v.union(
      v.literal("unrecognized_response"),
      v.literal("special_request"),
      v.literal("upsell_purchase"),
      v.literal("frustrated_member"),
      v.literal("manual"),
    ),
    memberName: v.string(),
    matchContext: v.optional(v.string()),
    issueDescription: v.string(),
    memberMessage: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("resolved"),
    ),
    notificationSent: v.boolean(),
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("admins")),
    adminNotes: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_member", ["memberId"])
    .index("by_created", ["createdAt"])
    .index("by_issueType", ["issueType"]),

  // -- Admin Notifications --
  notifications: defineTable({
    type: v.union(
      v.literal("escalation"),
      v.literal("lead"),
      v.literal("flow_action"),
      v.literal("system"),
    ),
    title: v.string(),
    message: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("urgent"),
    ),
    read: v.boolean(),
    actionUrl: v.optional(v.string()),
    relatedEntityType: v.optional(
      v.union(
        v.literal("escalation"),
        v.literal("membershipLead"),
        v.literal("flowInstance"),
        v.literal("phoneCall"),
      )
    ),
    relatedEntityId: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_read", ["read"])
    .index("by_created", ["createdAt"]),

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
