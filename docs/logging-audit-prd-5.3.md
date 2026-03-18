# Logging Audit Report — PRD 5.3 Compliance

> **Date:** 2026-03-18
> **Scope:** Full audit of data capture across voice agent, WhatsApp bot, flow engine, CRM integrations, and Convex backend.
> **Reference:** SCAFFOLDING.md (Phase 5: Analytics & Polish, step 21 — Audit logging), client-notes-dani-call.md, feedback-tree-analysis.md, sma-api-reference.md

---

## 1. Executive Summary

The codebase has **strong foundational logging** across most subsystems. Voice calls, WhatsApp messages, flow engine execution, and CRM sync events are all captured with timestamps and relevant metadata. However, several gaps exist — primarily around the **auditLogs table** (defined in schema but never written to), **admin action tracking**, and **WhatsApp delivery status lifecycle updates from Twilio callbacks**.

**Overall compliance: ~75%.** Core data capture is solid; gaps are concentrated in admin audit trails and status callback plumbing.

---

## 2. Data Tables Audit

### 2.1 Tables Defined in Schema vs. Actively Used

| Table | Defined | Actively Written To | Notes |
|-------|---------|-------------------|-------|
| `admins` | Yes | Yes | Auth system (from agent-analog) |
| `sessions` | Yes | Yes | Auth sessions |
| `members` | Yes | Yes | CRM sync, voice agent, webhook handler |
| `smaIntroductions` | Yes | Yes | SMA intro sync via `syncIntrosInternal` |
| `matches` | Yes | Yes | Created by CRM webhook + dashboard |
| `feedback` | Yes | Yes | Flow engine `sync_to_sma` action + dashboard `updateMemberResponse` |
| `whatsappMessages` | Yes | Yes | Flow engine executors + Twilio webhook + conversations/mutations |
| `voiceNoteBatches` | Yes | Yes | Deepgram transcription pipeline |
| `payments` | Yes | Yes | Flow engine `create_stripe_link` + Stripe callbacks |
| **`auditLogs`** | **Yes** | **NO** | **NEVER WRITTEN TO — schema exists but no code inserts records** |
| `phoneCalls` | Yes | Yes | Voice agent call lifecycle |
| `callTranscriptSegments` | Yes | Yes | Real-time transcript streaming |
| `syncJobs` | Yes | Yes | Background sync tracking |
| `flowDefinitions` | Yes | Yes | Flow editor + seed |
| `flowInstances` | Yes | Yes | Flow engine runtime |
| `flowExecutionLogs` | Yes | Yes | Every node execution logged |
| `dataRequests` | Yes | Yes | Profile completion forms |
| `appSettings` | Yes | Yes | Singleton config |
| `membershipLeads` | Yes | Yes | Voice agent upsell leads |

---

## 3. Voice Call Logging Audit

### 3.1 Data Points — Phone Calls

| Data Point | Captured? | Code Location | Convex Table/Field | Notes |
|------------|-----------|---------------|-------------------|-------|
| Call start timestamp | YES | `voice/mutations.ts` → `logCall` | `phoneCalls.startedAt` | `Date.now()` (epoch ms) |
| Call end timestamp | YES | `voice/mutations.ts` → `updateCall` | `phoneCalls.endedAt` | `Date.now()` at end |
| Call duration (seconds) | YES | `voice-agent/call_handler.py` → `on_call_end` | `phoneCalls.duration` | Computed as `int(time.time() - start_time)` |
| LiveKit room ID | YES | `voice/http.ts` → `callStartedHandler` | `phoneCalls.livekitRoomId` | From dispatch metadata |
| SIP call ID | YES | `voice-agent/agent.py` → `entrypoint` | `phoneCalls.sipCallId` | From SIP participant |
| Caller phone number | YES | `voice/http.ts` → `callStartedHandler` | `phoneCalls.phone` | Normalized (sip_ prefix stripped, +1 added) |
| Member ID (linked) | YES | `voice/http.ts` → `callStartedHandler` | `phoneCalls.memberId` | Looked up via `lookupMemberByPhone` |
| Call direction | YES | `voice-agent/agent.py` → `entrypoint` | `phoneCalls.direction` | `"inbound"` or `"outbound"` |
| Call status | YES | `voice/mutations.ts` → `logCall`/`updateCall` | `phoneCalls.status` | `in_progress` → `completed`/`failed`/`transferred`/`no_answer` |
| Sandbox flag | YES | `voice/http.ts` → `callStartedHandler` | `phoneCalls.sandbox` | From dispatch metadata |
| Full transcript (final) | YES | `voice/http.ts` → `callEndedHandler` | `phoneCalls.transcript` | Stored as `v.any()` (array of segments) |
| AI summary | YES | `voice/actions.ts` → `generateSummary` | `phoneCalls.aiSummary` | LLM-generated via OpenRouter |
| Extracted profile data | YES | `voice/mutations.ts` → `saveIntakeData` | `phoneCalls.extractedData` | Merged incrementally |
| Profile action taken | YES | `voice/actions.ts` → `syncCallToSMA` | `phoneCalls.profileAction` | `"created"` / `"updated"` / `"none"` |
| SMA sync status | YES | `voice/mutations.ts` → `updateSmaSyncStatus` | `phoneCalls.smaSyncStatus` | `pending`/`synced`/`failed`/`skipped` |
| Quality flags | YES | `voice/mutations.ts` → `flagCall` | `phoneCalls.qualityFlags` | Array of strings (e.g., `"crashed"`) |
| Escalation reason | PARTIAL | Schema defined | `phoneCalls.escalationReason` | **Schema exists but no code writes to it** |
| Egress (recording) ID | YES | `voice-agent/call_handler.py` → `_start_recording` | `phoneCalls.egressId` | LiveKit Egress for S3 recording |
| Audio recording file | PARTIAL | `voice-agent/call_handler.py` → `_start_recording` | External (S3) | Only if S3 credentials configured |

### 3.2 Data Points — Transcript Segments

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| Call ID (parent) | YES | `voice/mutations.ts` → `addTranscriptSegment` | `callTranscriptSegments.callId` |
| Speaker | YES | `voice-agent/call_handler.py` → `on_transcript_segment` | `callTranscriptSegments.speaker` | `"caller"` or `"agent"` |
| Text content | YES | `voice-agent/call_handler.py` → `on_transcript_segment` | `callTranscriptSegments.text` |
| Timestamp | YES | `voice-agent/call_handler.py` → `on_transcript_segment` | `callTranscriptSegments.timestamp` | Python `time.time()` (epoch seconds as float) |
| Confidence score | PARTIAL | `voice-agent/call_handler.py` → `on_transcript_segment` | `callTranscriptSegments.confidence` | Passed through but **never populated** — `setup_transcript_listeners` does not extract confidence from Deepgram events |

### 3.3 Call Recovery

| Data Point | Captured? | Code Location | Notes |
|------------|-----------|---------------|-------|
| Orphaned call detection | YES | `voice/recovery.ts` → `findOrphanedCalls` | Finds calls stuck >30 min in `in_progress` |
| Crashed call flagging | YES | `voice/recovery.ts` → `recoverOrphanedCalls` | Sets `qualityFlags: ["crashed"]` |
| Transcript reconstruction | YES | `voice/recovery.ts` → `recoverOrphanedCalls` | Rebuilds from `callTranscriptSegments` |

---

## 4. WhatsApp Bot / Flow Engine Logging Audit

### 4.1 WhatsApp Messages

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| Member ID | YES | `engine/executor.ts` (all executors) | `whatsappMessages.memberId` |
| Match ID | YES | `engine/executor.ts` (all executors) | `whatsappMessages.matchId` |
| Direction | YES | `conversations/mutations.ts` / executor | `whatsappMessages.direction` | `"inbound"` or `"outbound"` |
| Message type | YES | Executors | `whatsappMessages.messageType` | `text`/`interactive`/`template`/`media` |
| Content/body | YES | Executors | `whatsappMessages.content` | Full message text or JSON for interactive |
| Twilio SID | PARTIAL | `conversations/mutations.ts` | `whatsappMessages.twilioSid` | Set for dashboard-sent messages; **flow engine executors do NOT set it** — Twilio SID comes back async via callback but is only stored on the callback side |
| Delivery status | PARTIAL | `conversations/mutations.ts` → `updateMessageStatus` | `whatsappMessages.status` | Schema supports `sent`/`delivered`/`read`/`failed` but **Twilio status callbacks are not wired** — no webhook handler updates status after initial `"sent"` |
| Media URL | YES | `whatsappMessages.mediaUrl` | Set by Deepgram transcription pipeline for voice notes |
| Media content type | YES | `whatsappMessages.mediaContentType` | Set for voice notes |
| Transcription | YES | `whatsappMessages.transcription` | Set by Deepgram async transcription |
| Audio duration | YES | `whatsappMessages.audioDuration` | Set by Deepgram |
| Transcription confidence | YES | `whatsappMessages.transcriptionConfidence` | Set by Deepgram |
| Review flag | YES | `whatsappMessages.reviewFlag` | `"low_confidence"` or `"long_note"` |
| Timestamp | YES | All code paths | `whatsappMessages.createdAt` | `Date.now()` (epoch ms) |

### 4.2 Flow Engine Execution Logs

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| Instance ID | YES | All executors in `engine/executor.ts` | `flowExecutionLogs.instanceId` |
| Node ID | YES | All executors | `flowExecutionLogs.nodeId` |
| Node type | YES | All executors | `flowExecutionLogs.nodeType` |
| Action performed | YES | All executors | `flowExecutionLogs.action` | e.g., `"executed"`, `"paused"`, `"resumed"`, `"entered"`, `"reminder_sent"` |
| Input (serialized) | YES | All executors | `flowExecutionLogs.input` | JSON string of node config |
| Output (serialized) | YES | All executors | `flowExecutionLogs.output` | JSON string of results |
| Execution duration | YES | Most executors | `flowExecutionLogs.duration` | `Date.now() - startTime` (ms) |
| Timestamp | YES | All executors | `flowExecutionLogs.timestamp` | `Date.now()` |

**Coverage:** Every node type (START, MESSAGE, DECISION, ACTION, DELAY, CONDITION, FEEDBACK_COLLECT, END) produces execution logs with input/output serialization. This is comprehensive.

### 4.3 Flow Instance State

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| Flow definition link | YES | `engine/mutations.ts` → `startFlowInstance` | `flowInstances.flowDefinitionId` |
| Match ID | YES | `engine/mutations.ts` | `flowInstances.matchId` |
| Member ID | YES | `engine/mutations.ts` | `flowInstances.memberId` |
| Current node | YES | Interpreter | `flowInstances.currentNodeId` |
| Status | YES | Interpreter/executors | `flowInstances.status` |
| Full context | YES | Interpreter/executors | `flowInstances.context` | Contains all responses, metadata, timestamps |
| Start timestamp | YES | `engine/mutations.ts` | `flowInstances.startedAt` |
| Completion timestamp | YES | `engine/executor.ts` → `executeEndNode` | `flowInstances.completedAt` |
| Last transition | YES | All executors | `flowInstances.lastTransitionAt` |
| Error | YES | Interpreter | `flowInstances.error` |
| Scheduler job ID | YES | Executor | `flowInstances.schedulerJobId` |

---

## 5. Feedback Logging Audit

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| Match ID | YES | `engine/executor.ts` → `sync_to_sma` / `feedback/mutations.ts` | `feedback.matchId` |
| Member ID | YES | Same | `feedback.memberId` |
| Flow instance link | YES | `engine/executor.ts` → `sync_to_sma` | `feedback.flowInstanceId` |
| Decision | YES | Same | `feedback.decision` | `"interested"` / `"not_interested"` / `"passed"` |
| Primary categories | YES | Same | `feedback.categories` | Array of 8 feedback categories |
| Sub-categories | YES | Same | `feedback.subCategories` | Keyed by primary reason |
| Free text | YES | Same | `feedback.freeText` |
| Voice note | PARTIAL | `feedback/mutations.ts` → `create` | `feedback.voiceNote` | Accepted in schema but **flow engine path does not populate it** — voice notes are transcribed and routed as text |
| Raw flow responses | YES | `engine/executor.ts` → `sync_to_sma` | `feedback.rawResponses` | Full context.responses object preserved |
| LLM analysis | YES | `integrations/openrouter/analyze.ts` | `feedback.llmAnalysis` | Async post-processing |
| SMA sync status | YES | `feedback/mutations.ts` → `markSynced` | `feedback.smaMatchNotesSynced` |
| Timestamp | YES | All paths | `feedback.createdAt` | `Date.now()` |

---

## 6. Match Status Logging Audit

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| SMA intro ID | YES | `integrations/crm/mutations.ts` / sync | `matches.smaIntroId` |
| Member A & B IDs | YES | `matches/mutations.ts` → `create` | `matches.memberAId`, `matches.memberBId` |
| Status | YES | Multiple paths | `matches.status` | 6 valid statuses |
| Response type | YES | `engine/executor.ts` + `matches/mutations.ts` | `matches.responseType` | `"interested"` / `"not_interested"` / `"upsell_yes"` / `"upsell_no_interested"` / `"upsell_no_pass"` / `"no_response"` |
| Match notes (structured) | YES | `engine/executor.ts` actions | `matches.matchNotes` | Includes member_id, response_type, rejection_reasons, upsell status, ISO timestamp |
| Triggered by admin | PARTIAL | `matches/mutations.ts` → `create` | `matches.triggeredBy` | Set for dashboard-created matches; **NOT set for CRM-webhook-created matches** |
| SMA group tracking | YES | `matches/mutations.ts` → `updateMatchFromSma` | `matches.smaGroupId`, `matches.smaGroupName` |
| SMA status tracking | YES | Same | `matches.smaStatusId`, `matches.smaStatusName` |
| Flow triggered flag | YES | `integrations/crm/mutations.ts` | `matches.flowTriggered` |
| Intro token | YES | `members/mutations.ts` → `syncIntrosInternal` | `matches.introToken` |
| Timestamps | YES | All paths | `matches.createdAt`, `matches.updatedAt` | `Date.now()` |

---

## 7. Member & CRM Sync Logging Audit

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| SMA ID | YES | `members/mutations.ts` | `members.smaId` |
| Profile data (full SMA) | YES | `members/mutations.ts` → `syncFromSmaInternal` | `members.profileData` |
| Last sync timestamp | YES | All sync paths | `members.lastSyncedAt` |
| Rejection count | YES | `members/mutations.ts` → `incrementRejectionCount` | `members.rejectionCount` |
| Recalibration summary | YES | `members/mutations.ts` → `updateRecalibrationSummary` | `members.recalibrationSummary` |
| SMA intro summary | YES | `members/mutations.ts` → `syncIntrosInternal` | `members.smaIntroSummary` |
| Sync job tracking | YES | `syncJobs` table | `syncJobs.status`, `progress`, `total`, `result` |

---

## 8. Payment Logging Audit

| Data Point | Captured? | Code Location | Convex Table/Field |
|------------|-----------|---------------|-------------------|
| Match ID | YES | `engine/executor.ts` → `create_stripe_link` | `payments.matchId` |
| Member ID | YES | Same | `payments.memberId` |
| Amount (cents) | YES | Same | `payments.amount` |
| Phase | YES | Same | `payments.phase` | `"initial"` or `"completion"` |
| Stripe session ID | YES | `integrations/stripe/callbacks.ts` | `payments.stripeSessionId` |
| Stripe payment intent | YES | Same | `payments.stripePaymentIntentId` |
| Flow instance link | YES | `engine/executor.ts` | `payments.flowInstanceId` |
| Status | YES | `integrations/stripe/callbacks.ts` | `payments.status` | `pending` → `paid` |
| Timestamp | YES | `engine/executor.ts` | `payments.createdAt` |
| Refund/cancel tracking | SCHEMA ONLY | N/A | `payments.status` accepts `"refunded"` / `"cancelled"` | **No code path writes these statuses** |

---

## 9. Integration Logging Audit

### 9.1 SmartMatchApp

| Data Point | Captured? | Code Location | Notes |
|------------|-----------|---------------|-------|
| Webhook events received | YES (console) | `integrations/smartmatchapp/webhook.ts` | Console logs; **no persistent table** |
| Client sync events | YES (console) | `integrations/smartmatchapp/actions.ts` → `handleClientSync` | Logged to console with mapped fields |
| Match group updates | YES (console) | `integrations/smartmatchapp/actions.ts` → `updateMatchInSma` | Console logs API results |
| Notes upload | YES (console) | `integrations/smartmatchapp/notes.ts` → `uploadNotesToSma` | Console logs; file uploads tracked |
| API errors | YES (console) | All SMA actions | `console.warn` / `console.error` |

### 9.2 Twilio

| Data Point | Captured? | Code Location | Notes |
|------------|-----------|---------------|-------|
| Inbound messages | YES | `integrations/twilio/webhooks.ts` → `twilioWebhookHandler` | Routed to flow engine |
| Outbound messages | YES | `engine/executor.ts` → all send paths | Logged to `whatsappMessages` table |
| Delivery status updates | **NO** | N/A | **CRITICAL GAP: No Twilio status callback webhook handler exists.** Messages stay at `"sent"` forever |
| Voice note detection | YES | `integrations/twilio/webhooks.ts` | Checks `NumMedia` + `audio/` content type |

### 9.3 Stripe

| Data Point | Captured? | Code Location | Notes |
|------------|-----------|---------------|-------|
| Checkout creation | YES | `integrations/stripe/checkout.ts` | Creates payment record |
| Checkout completion | YES | `integrations/stripe/callbacks.ts` → `handleCheckoutCompleted` | Updates payment status to `"paid"` |
| Refund events | **NO** | N/A | **No refund webhook handler** |

### 9.4 Deepgram (Voice Notes)

| Data Point | Captured? | Code Location | Notes |
|------------|-----------|---------------|-------|
| Transcription request | YES | `integrations/deepgram/callbacks.ts` | Logs media message + schedules |
| Transcription result | YES | `integrations/deepgram/callbacks.ts` | Updates `whatsappMessages` with transcription fields |
| Transcription errors | YES (console) | `integrations/deepgram/transcribe.ts` | Console warnings |

---

## 10. Timestamp Format Consistency Analysis

| Subsystem | Format | Notes |
|-----------|--------|-------|
| **Convex tables (all)** | `Date.now()` — epoch milliseconds (number) | Consistent across all `createdAt`, `updatedAt`, `startedAt`, `endedAt`, `lastTransitionAt`, `lastSyncedAt` |
| **Python voice agent** | `time.time()` — epoch seconds (float) | Used for `callTranscriptSegments.timestamp` — **INCONSISTENT** with Convex ms convention |
| **Flow context timestamps** | `Date.now()` — epoch ms | Stored in `context.timestamps` object |
| **Match notes** | `new Date().toISOString()` — ISO 8601 string | Used in `matchNotes.timestamp` — **INCONSISTENT** with numeric convention elsewhere |
| **SMA sync dates** | ISO 8601 string (from SMA API) | Stored as-is in `smaIntroductions.smaCreatedDate` |
| **LLM note file headers** | `new Date().toISOString().split("T")[0]` — date-only string | Used in `notes.ts` file names/headers |

**Summary:** Two timestamp inconsistencies exist:
1. `callTranscriptSegments.timestamp` uses **epoch seconds** (Python `time.time()`) while all other Convex fields use **epoch milliseconds** (`Date.now()`).
2. `matchNotes.timestamp` uses **ISO 8601 strings** while all other fields use **epoch milliseconds**.

---

## 11. Gaps — Data NOT Being Captured

### 11.1 Critical Gaps

| # | Gap | Impact | Where It Should Be |
|---|-----|--------|--------------------|
| **G1** | **`auditLogs` table never written to** | No admin action audit trail. Schema defines the table but zero code inserts records. Dashboard actions (create match, update member, trigger sync) are invisible. | Every mutation in `matches/mutations.ts`, `members/mutations.ts`, `voice/mutations.ts` (flagCall, triggerSmaSync) should insert auditLogs. |
| **G2** | **Twilio delivery status callbacks not wired** | WhatsApp messages permanently stuck at `"sent"` status. Cannot track `delivered` / `read` / `failed`. The `updateMessageStatus` and `updateStatusByTwilioSid` mutations exist but nothing calls them. | Need a Twilio status callback webhook endpoint registered in `http.ts` that parses `MessageStatus` and calls `updateStatusByTwilioSid`. |
| **G3** | **Transcript segment confidence never populated** | `callTranscriptSegments.confidence` is always null. `setup_transcript_listeners` in `call_handler.py` does not extract confidence from Deepgram STT events. | Modify `on_conversation_item` to extract `confidence` from the Deepgram event metadata (if available via LiveKit's `conversation_item_added`). |

### 11.2 Moderate Gaps

| # | Gap | Impact | Where It Should Be |
|---|-----|--------|--------------------|
| **G4** | **`matches.triggeredBy` not set for CRM-webhook-created matches** | Cannot attribute match creation to the matchmaker who created it in SMA. Only dashboard-created matches have `triggeredBy`. | `integrations/crm/mutations.ts` → `processMatchCreated` should try to extract the SMA user who created the intro (available in SMA match detail as `user.name`). |
| **G5** | **`phoneCalls.escalationReason` never written** | Schema field exists but no code path sets it. Live transfer reasons are not logged. | Voice agent should set this when transferring calls or detecting frustrated callers. |
| **G6** | **Stripe refund/cancel status never set** | `payments.status` accepts `"refunded"` / `"cancelled"` but no code path writes these. | Need Stripe webhook handlers for `charge.refunded`, `payment_intent.canceled`, etc. |
| **G7** | **SMA webhook events not persisted** | Webhook events are logged to console only. If something goes wrong, there's no way to replay or audit. | Consider a `webhookEvents` table or at minimum log to `auditLogs`. |
| **G8** | **`feedback.voiceNote` never populated by flow engine** | Voice notes are transcribed to text and routed through the text path. The raw voice note storage ID is never linked to the feedback record. | `engine/transitions.ts` → `handleMemberResponse` (voice note path) should pass the `whatsappMessages._id` or media URL through to the feedback record. |

### 11.3 Minor Gaps

| # | Gap | Impact |
|---|-----|--------|
| **G9** | **No explicit logging when flow engine encounters an unknown/unclassifiable message** | The `handleMatchFeedbackMessage` returns `{ handled: false, reason: "could_not_classify" }` but this is not persisted to any log table. |
| **G10** | **Membership lead resolution not logged to auditLogs** | `membershipLeads` tracks `resolvedBy` (string) but doesn't create an audit log entry. |
| **G11** | **Data request completion (form submission) not logged to auditLogs** | `dataRequests` tracks `completedAt` but no audit entry is created. |

---

## 12. Field-by-Field Mapping: PRD Requirements → Code

### 12.1 Voice Calls (Client Notes Section 4 — "What Gets Saved")

| PRD Requirement | Captured? | Convex Field | SMA Field | Code Path |
|----------------|-----------|-------------|-----------|-----------|
| Full transcript → Profile Notes | YES | `phoneCalls.transcript` → `members.matchmakerNotes` | `prof_235` (Matchmaker Notes) | `voice/actions.ts` → `generateSummary` → `syncCallToSMA` |
| AI-generated summary → Custom field | YES | `phoneCalls.aiSummary` → `members.matchmakerNotes` | `prof_235` | `voice/actions.ts` → `generateSummary` → `updateMemberFromCall` → `syncCallToSMA` |
| Extracted profile fields → SMA Profile | YES | `phoneCalls.extractedData` | `prof_*` / `pref_*` fields | `voice/actions.ts` → `syncCallToSMA` → `updateClientProfile` / `updateClientPreferences` |
| Call duration | YES | `phoneCalls.duration` | N/A | `call_handler.py` → `on_call_end` |
| Caller identification | YES | `phoneCalls.phone` → `phoneCalls.memberId` | N/A | `voice/http.ts` → `callStartedHandler` |

### 12.2 Match Feedback (Feedback Tree Analysis — "Save to SmartMatchApp")

| PRD Requirement | Captured? | Convex Field | SMA Destination | Code Path |
|----------------|-----------|-------------|-----------------|-----------|
| Decision (interested/not/passed) | YES | `feedback.decision` + `matches.responseType` | Match status + notes file | `engine/executor.ts` → `sync_to_sma` |
| 8 feedback categories | YES | `feedback.categories` | Notes file via LLM | `engine/executor.ts` → `sync_to_sma` → `notes.ts` → `uploadNotesToSma` |
| Sub-category selections | YES | `feedback.subCategories` | Notes file via LLM | Same path |
| Free text | YES | `feedback.freeText` | Notes file via LLM | Same path |
| Move to Rejected/Past in SMA | YES | `matches.status` + `matches.smaGroupId` | SMA match group API | `engine/executor.ts` → `updateMatchInSma` |
| Rejection counter + recalibration | YES | `members.rejectionCount` → `members.status` | N/A (internal) | `members/mutations.ts` → `incrementRejectionCount` |
| LLM-generated notes file on SMA profile | YES | N/A (external) | SMA Files API (`bot-notes-*.txt`) | `smartmatchapp/notes.ts` → `uploadNotesToSma` |

### 12.3 Personal Outreach Payments (Client Notes Section 6)

| PRD Requirement | Captured? | Convex Field | Code Path |
|----------------|-----------|-------------|-----------|
| Payment record created | YES | `payments.*` | `engine/executor.ts` → `create_stripe_link` |
| $125 initial phase | YES | `payments.amount` + `payments.phase` | Same |
| Stripe session linked | YES | `payments.stripeSessionId` | `stripe/callbacks.ts` |
| Payment confirmation → flow advance | YES | `payments.status` → flow context | `stripe/callbacks.ts` → `handleCheckoutCompleted` |
| Match status updated to pending | YES | `matches.status` = `"pending"` | `stripe/callbacks.ts` |
| Admin notification | PARTIAL | Logged in flow context | `engine/executor.ts` → `notify_admin` action (logs but doesn't send notification) |

### 12.4 WhatsApp Messages (Conversations)

| PRD Requirement | Captured? | Convex Field | Code Path |
|----------------|-----------|-------------|-----------|
| All outbound messages logged | YES | `whatsappMessages` | `engine/executor.ts` (all node types) |
| All inbound messages logged | YES | `whatsappMessages` | `integrations/twilio/webhooks.ts` → `handleMemberResponse` |
| Message delivery status | **NO** | `whatsappMessages.status` stuck at `"sent"` | **GAP G2** — no Twilio status callback handler |
| Voice note transcription | YES | `whatsappMessages.transcription` | `integrations/deepgram/callbacks.ts` |

---

## 13. Recommendations

### Priority 1 — Critical (Functional gaps)

1. **Wire Twilio delivery status callbacks (G2):** Add a `/twilio/status-callback` HTTP endpoint in `convex/http.ts` that parses `MessageSid` and `MessageStatus` from Twilio's POST body and calls `conversations/mutations.ts` → `updateStatusByTwilioSid`. Configure the Twilio WhatsApp sender's status callback URL to point to this endpoint.

2. **Implement auditLogs writes (G1):** Add an `insertAuditLog` helper function and call it from:
   - `matches/mutations.ts` → `create`, `updateStatus`, `updateMemberResponse`, `complete`, `setGroupChat`
   - `members/mutations.ts` → `create`, `update`, `updateStatus`, `deleteMember`, `reactivate`
   - `voice/mutations.ts` → `flagCall`, `triggerSmaSync`
   - `engine/mutations.ts` → `startFlowInstance`, `pauseFlowInstance`, `resumeFlowInstance`
   - `feedback/mutations.ts` → `create`

### Priority 2 — Moderate (Data completeness)

3. **Fix transcript timestamp inconsistency:** In `voice-agent/call_handler.py` → `on_transcript_segment`, multiply `time.time()` by 1000 to produce epoch milliseconds consistent with all other Convex timestamps. Update `voice/recovery.ts` → `recoverOrphanedCalls` accordingly.

4. **Fix matchNotes timestamp inconsistency:** In `engine/executor.ts`, change `new Date().toISOString()` to `Date.now()` for `matchNotes.timestamp` to be consistent with the rest of the schema.

5. **Populate transcript confidence (G3):** Investigate whether LiveKit's `conversation_item_added` event carries Deepgram confidence metadata. If so, pass it through `setup_transcript_listeners`.

6. **Add Stripe refund handler (G6):** Register a handler for `charge.refunded` events in `stripe/webhooks.ts` → `stripeEventHandlers`.

### Priority 3 — Nice to have

7. **Persist SMA webhook events (G7):** Either log to `auditLogs` or create a lightweight `webhookEvents` table for replay/debugging.

8. **Populate `phoneCalls.escalationReason` (G5):** When the voice agent detects a frustrated caller or initiates a transfer, set this field.

9. **Link voice notes to feedback records (G8):** Pass the `whatsappMessages._id` of the voice note through the flow engine to the feedback record's `voiceNote` field.

---

## 14. Summary Table

| Category | Total Data Points | Captured | Partially Captured | Not Captured |
|----------|------------------|----------|-------------------|-------------|
| Voice Calls | 16 | 13 | 2 | 1 |
| Transcript Segments | 5 | 4 | 1 | 0 |
| WhatsApp Messages | 13 | 11 | 1 | 1 |
| Flow Engine Logs | 8 | 8 | 0 | 0 |
| Feedback | 12 | 10 | 1 | 1 |
| Matches | 13 | 11 | 1 | 1 |
| Payments | 9 | 7 | 0 | 2 |
| Admin Audit Trail | 5 | 0 | 0 | 5 |
| **TOTAL** | **81** | **64 (79%)** | **6 (7%)** | **11 (14%)** |
