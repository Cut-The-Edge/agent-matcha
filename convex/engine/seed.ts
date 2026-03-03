// @ts-nocheck
/**
 * Flow Engine — Seed Default Flow
 *
 * Creates Dani's "Match Feedback Flow" as the default flow definition.
 * This is the core conversation tree that Agent Matcha follows for every match.
 *
 * Tree Structure:
 *   START → Initial Message → Wait for Response → Member Decision (4 branches)
 *     ├── Interested → Consent Decision → Yes: Send Intro / No: Soft Pass
 *     ├── Not Interested → Feedback Collection → Sync to SMA → Check Rejections → Recalibration?
 *     ├── Reschedule → Acknowledge → Delay → Loop Back
 *     └── Wants to Meet (Personal Outreach) → Explain Service → Stripe Link → Payment Check → Personal Intro
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

// ============================================================================
// Node position constants — tree layout (top-to-bottom, branches spread on x)
// ============================================================================

const X_CENTER = 600;
const X_LEFT = 100;
const X_CENTER_LEFT = 350;
const X_CENTER_RIGHT = 850;
const X_RIGHT = 1100;
const Y_START = 50;
const Y_STEP = 120;

// ============================================================================
// seedDefaultFlow — Idempotent seed function
// ============================================================================

export const seedDefaultFlow = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Check if a default flow already exists
    const existingDefault = await ctx.db
      .query("flowDefinitions")
      .withIndex("by_type", (q) => q.eq("type", "match_feedback"))
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first();

    if (existingDefault) {
      return { alreadyExists: true, flowDefinitionId: existingDefault._id };
    }

    const now = Date.now();

    // ========================================================================
    // NODES
    // ========================================================================

    const nodes = [
      // ---- Row 0: Start ----
      {
        nodeId: "node_start",
        type: "start",
        label: "Match Created",
        position: { x: X_CENTER, y: Y_START },
        config: {
          triggerType: "match_created",
        },
      },

      // ---- Row 1: Initial outreach message ----
      {
        nodeId: "node_initial_msg",
        type: "message",
        label: "Send Match Notification",
        position: { x: X_CENTER, y: Y_START + Y_STEP },
        config: {
          template:
            "Hey {{memberName}}! Great news — we have a new match for you. Take a look and let us know what you think. Did you receive your match?",
          channel: "whatsapp",
        },
      },

      // ---- Row 2: Wait for response (3 days) ----
      {
        nodeId: "node_wait_response",
        type: "delay",
        label: "Wait 3 Days for Response",
        position: { x: X_CENTER, y: Y_START + Y_STEP * 2 },
        config: {
          duration: 3,
          unit: "days",
          reminderAt: 2,
          reminderTemplate:
            "Hey {{memberName}}, just checking in! Have you had a chance to review your match? We'd love to hear your thoughts.",
          timeoutEdgeId: "edge_timeout_to_expired",
        },
      },

      // ---- Row 3: Main decision — 4 branches ----
      {
        nodeId: "node_main_decision",
        type: "decision",
        label: "Member Response",
        position: { x: X_CENTER, y: Y_START + Y_STEP * 3 },
        config: {
          question:
            "What are your thoughts on the match?",
          options: [
            {
              value: "interested",
              label: "Interested",
              edgeId: "edge_interested",
            },
            {
              value: "not_interested",
              label: "Not Interested",
              edgeId: "edge_not_interested",
            },
            {
              value: "reschedule",
              label: "Reschedule",
              edgeId: "edge_reschedule",
            },
            {
              value: "wants_to_meet",
              label: "Wants to Meet",
              edgeId: "edge_wants_to_meet",
            },
          ],
          timeout: 259200000, // 3 days in ms
          timeoutEdgeId: "edge_timeout_decision",
        },
      },

      // ======================================================================
      // BRANCH 1: INTERESTED
      // ======================================================================

      // Row 4: Interested — excitement message
      {
        nodeId: "node_interested_msg",
        type: "message",
        label: "Interested — Next Steps",
        position: { x: X_LEFT, y: Y_START + Y_STEP * 4 },
        config: {
          template:
            "That's wonderful to hear! I would love to set up an in-person meet. Let me handle the scheduling and planning together with some insight and ideas to make it great. Would you like me to go ahead and introduce you?",
          channel: "whatsapp",
        },
      },

      // Row 5: Consent decision
      {
        nodeId: "node_consent_decision",
        type: "decision",
        label: "Consent to Introduction",
        position: { x: X_LEFT, y: Y_START + Y_STEP * 5 },
        config: {
          question: "Would you like me to go ahead with the introduction?",
          options: [
            {
              value: "yes",
              label: "Yes — Let's do it!",
              edgeId: "edge_consent_yes",
            },
            {
              value: "no",
              label: "No thank you, I'll pass",
              edgeId: "edge_consent_no",
            },
          ],
          timeout: 172800000, // 2 days
          timeoutEdgeId: "edge_consent_timeout",
        },
      },

      // Row 6a: Consent Yes — confirm + action
      {
        nodeId: "node_consent_yes_msg",
        type: "message",
        label: "Introduction Confirmation",
        position: { x: X_LEFT - 100, y: Y_START + Y_STEP * 6 },
        config: {
          template:
            "Great! I'll initiate the introduction from our end. This first introduction is special — I'll connect with them directly and keep you updated as soon as we know more. If there's anything specific you'd like me to know, let me know.",
          channel: "whatsapp",
        },
      },

      // Row 7a: Action — notify admin
      {
        nodeId: "node_notify_admin_interested",
        type: "action",
        label: "Notify Admin — Mutual Interest",
        position: { x: X_LEFT - 100, y: Y_START + Y_STEP * 7 },
        config: {
          actionType: "notify_admin",
          params: {
            message: "Member consented to introduction — proceed with mutual intro",
            priority: "high",
          },
        },
      },

      // Row 8a: Action — send introduction
      {
        nodeId: "node_send_intro",
        type: "action",
        label: "Send Introduction",
        position: { x: X_LEFT - 100, y: Y_START + Y_STEP * 8 },
        config: {
          actionType: "send_introduction",
          params: {},
        },
      },

      // Row 9a: Action — update match status
      {
        nodeId: "node_update_match_interested",
        type: "action",
        label: "Update Match — Mutual Interest",
        position: { x: X_LEFT - 100, y: Y_START + Y_STEP * 9 },
        config: {
          actionType: "update_match_status",
          params: { final_status: "active", response_type: "interested" },
        },
      },

      // Row 10a: End — interested completed
      {
        nodeId: "node_end_interested",
        type: "end",
        label: "End — Introduction Sent",
        position: { x: X_LEFT - 100, y: Y_START + Y_STEP * 10 },
        config: {
          endType: "completed",
        },
      },

      // Row 6b: Consent No — soft pass
      {
        nodeId: "node_consent_no_msg",
        type: "message",
        label: "Soft Pass Acknowledgment",
        position: { x: X_LEFT + 150, y: Y_START + Y_STEP * 6 },
        config: {
          template:
            "No problem at all. With every match there's no obligation. If something shifts or sounds good in a bit, just let us know and we'll take care of it.",
          channel: "whatsapp",
        },
      },

      // Row 7b: Action — move to past introductions
      {
        nodeId: "node_update_match_passed",
        type: "action",
        label: "Update Match — Passed",
        position: { x: X_LEFT + 150, y: Y_START + Y_STEP * 7 },
        config: {
          actionType: "update_match_status",
          params: { final_status: "past", response_type: "upsell_no_pass" },
        },
      },

      // Row 8b: End — soft pass
      {
        nodeId: "node_end_passed",
        type: "end",
        label: "End — Passed",
        position: { x: X_LEFT + 150, y: Y_START + Y_STEP * 8 },
        config: {
          endType: "completed",
        },
      },

      // ======================================================================
      // BRANCH 2: NOT INTERESTED
      // ======================================================================

      // Row 4: Empathetic acknowledgment
      {
        nodeId: "node_not_interested_msg",
        type: "message",
        label: "Empathetic Acknowledgment",
        position: { x: X_CENTER_LEFT, y: Y_START + Y_STEP * 4 },
        config: {
          template:
            "I totally get it. I'm here to help you find that amazing match. Just so I can refine your future matches and really understand what you're looking for — would you mind sharing a bit about what didn't click? It doesn't have to be anything long.",
          channel: "whatsapp",
        },
      },

      // Row 5: Feedback collection (8 categories)
      {
        nodeId: "node_feedback_collect",
        type: "feedback_collect",
        label: "Collect Rejection Feedback",
        position: { x: X_CENTER_LEFT, y: Y_START + Y_STEP * 5 },
        config: {
          categories: [
            "physical_attraction",
            "photos_only",
            "chemistry",
            "willingness_to_meet",
            "age_preference",
            "location",
            "career_income",
            "something_specific",
          ],
          allowFreeText: true,
          feedbackType: "not_interested",
        },
      },

      // Row 6: Action — sync feedback to SMA
      {
        nodeId: "node_sync_feedback_sma",
        type: "action",
        label: "Sync Feedback to SMA",
        position: { x: X_CENTER_LEFT, y: Y_START + Y_STEP * 6 },
        config: {
          actionType: "sync_to_sma",
          params: {
            noteType: "not_interested",
            fields: [
              "status",
              "physical_feedback",
              "personality_feedback",
              "chemistry_notes",
              "attraction_level",
              "lifestyle_alignment",
              "additional_info",
              "interest_level",
              "meta_feedback",
            ],
          },
        },
      },

      // Row 7: Action — update match status to declined
      {
        nodeId: "node_update_match_declined",
        type: "action",
        label: "Move to Rejected Introductions",
        position: { x: X_CENTER_LEFT, y: Y_START + Y_STEP * 7 },
        config: {
          actionType: "update_match_status",
          params: { final_status: "rejected", response_type: "not_interested" },
        },
      },

      // Row 8: Condition — check rejection count >= 3
      {
        nodeId: "node_check_rejections",
        type: "condition",
        label: "Rejection Count >= 3?",
        position: { x: X_CENTER_LEFT, y: Y_START + Y_STEP * 8 },
        config: {
          expression: "rejectionCount >= 3",
          trueEdgeId: "edge_recal_yes",
          falseEdgeId: "edge_recal_no",
        },
      },

      // Row 9a: Recalibration — message
      {
        nodeId: "node_recalibration_msg",
        type: "message",
        label: "Recalibration Offer",
        position: { x: X_CENTER_LEFT - 120, y: Y_START + Y_STEP * 9 },
        config: {
          template:
            "I notice we haven't quite found the right match yet. After three tries, it's usually helpful to recalibrate together so we don't keep missing. Let's book a quick alignment call so we can adjust our search and move forward intentionally.",
          channel: "whatsapp",
        },
      },

      // Row 10a: Action — schedule recalibration
      {
        nodeId: "node_schedule_recal",
        type: "action",
        label: "Schedule Recalibration",
        position: { x: X_CENTER_LEFT - 120, y: Y_START + Y_STEP * 10 },
        config: {
          actionType: "schedule_recalibration",
          params: {
            reason: "3+ rejections",
            bookingType: "alignment_call",
          },
        },
      },

      // Row 11a: End — recalibration
      {
        nodeId: "node_end_recalibration",
        type: "end",
        label: "End — Recalibration Scheduled",
        position: { x: X_CENTER_LEFT - 120, y: Y_START + Y_STEP * 11 },
        config: {
          endType: "completed",
        },
      },

      // Row 9b: No recalibration needed — end
      {
        nodeId: "node_end_not_interested",
        type: "end",
        label: "End — Not Interested",
        position: { x: X_CENTER_LEFT + 120, y: Y_START + Y_STEP * 9 },
        config: {
          endType: "completed",
        },
      },

      // ======================================================================
      // BRANCH 3: RESCHEDULE
      // ======================================================================

      // Row 4: Acknowledge reschedule
      {
        nodeId: "node_reschedule_msg",
        type: "message",
        label: "Reschedule Acknowledgment",
        position: { x: X_CENTER_RIGHT, y: Y_START + Y_STEP * 4 },
        config: {
          template:
            "No problem at all! Take your time reviewing the match. I'll check back in with you in a few days. Just message me whenever you're ready.",
          channel: "whatsapp",
        },
      },

      // Row 5: Delay — wait 3 days then loop back
      {
        nodeId: "node_reschedule_delay",
        type: "delay",
        label: "Wait for Reschedule",
        position: { x: X_CENTER_RIGHT, y: Y_START + Y_STEP * 5 },
        config: {
          duration: 3,
          unit: "days",
          reminderAt: 2,
          reminderTemplate:
            "Hey {{memberName}}, just a gentle reminder — whenever you're ready to share your thoughts on the match, I'm here!",
        },
      },

      // Row 6: Follow-up message after delay
      {
        nodeId: "node_reschedule_followup",
        type: "message",
        label: "Reschedule Follow-Up",
        position: { x: X_CENTER_RIGHT, y: Y_START + Y_STEP * 6 },
        config: {
          template:
            "Hey {{memberName}}! I'm checking back in about your match. Have you had a chance to think about it? I'd love to hear your thoughts.",
          channel: "whatsapp",
        },
      },

      // Row 7: Decision — second chance after reschedule
      {
        nodeId: "node_reschedule_decision",
        type: "decision",
        label: "Post-Reschedule Response",
        position: { x: X_CENTER_RIGHT, y: Y_START + Y_STEP * 7 },
        config: {
          question: "What are your thoughts on the match now?",
          options: [
            {
              value: "interested",
              label: "Interested",
              edgeId: "edge_resched_interested",
            },
            {
              value: "not_interested",
              label: "Not Interested",
              edgeId: "edge_resched_not_interested",
            },
          ],
          timeout: 259200000,
          timeoutEdgeId: "edge_resched_timeout",
        },
      },

      // Row 8: End — reschedule expired
      {
        nodeId: "node_end_reschedule_expired",
        type: "end",
        label: "End — Reschedule Expired",
        position: { x: X_CENTER_RIGHT, y: Y_START + Y_STEP * 8 },
        config: {
          endType: "expired",
        },
      },

      // ======================================================================
      // BRANCH 4: WANTS TO MEET (Personal Outreach)
      // ======================================================================

      // Row 4: Explain personal outreach service
      {
        nodeId: "node_personal_outreach_msg",
        type: "message",
        label: "Explain Personal Outreach",
        position: { x: X_RIGHT, y: Y_START + Y_STEP * 4 },
        config: {
          template:
            "That's amazing! So you'd like to take a more personal approach. Our Personal Outreach service means I'll personally reach out to your match, facilitate the introduction, and help plan your first meeting. This is a premium service. Let me send you the details.",
          channel: "whatsapp",
        },
      },

      // Row 5: Action — create Stripe payment link
      {
        nodeId: "node_create_stripe_link",
        type: "action",
        label: "Create Stripe Payment Link",
        position: { x: X_RIGHT, y: Y_START + Y_STEP * 5 },
        config: {
          actionType: "create_stripe_link",
          params: {
            amount: 15000,
            description: "Personal Outreach Service — Initial Payment",
          },
        },
      },

      // Row 6: Message — send payment link
      {
        nodeId: "node_payment_link_msg",
        type: "message",
        label: "Send Payment Link",
        position: { x: X_RIGHT, y: Y_START + Y_STEP * 6 },
        config: {
          template:
            "Here's the link to get started with Personal Outreach. Once the payment is confirmed, I'll personally reach out to your match and facilitate everything.",
          channel: "whatsapp",
        },
      },

      // Row 7: Delay — 24h payment reminder
      {
        nodeId: "node_payment_delay",
        type: "delay",
        label: "Wait 24h for Payment",
        position: { x: X_RIGHT, y: Y_START + Y_STEP * 7 },
        config: {
          duration: 24,
          unit: "hours",
          reminderAt: 12,
          reminderTemplate:
            "Hey {{memberName}}, just a quick reminder about the Personal Outreach service. The link is still active if you'd like to proceed!",
          timeoutEdgeId: "edge_payment_timeout",
        },
      },

      // Row 8: Condition — payment received?
      {
        nodeId: "node_check_payment",
        type: "condition",
        label: "Payment Received?",
        position: { x: X_RIGHT, y: Y_START + Y_STEP * 8 },
        config: {
          expression: "paymentReceived == true",
          trueEdgeId: "edge_payment_yes",
          falseEdgeId: "edge_payment_no",
        },
      },

      // Row 9a: Payment received — personal intro
      {
        nodeId: "node_payment_confirmed_msg",
        type: "message",
        label: "Payment Confirmed",
        position: { x: X_RIGHT - 100, y: Y_START + Y_STEP * 9 },
        config: {
          template:
            "Payment confirmed! I'm now reaching out to your match personally. I'll keep you updated every step of the way. This is going to be great!",
          channel: "whatsapp",
        },
      },

      // Row 10a: Action — send personal introduction
      {
        nodeId: "node_personal_intro_action",
        type: "action",
        label: "Send Personal Introduction",
        position: { x: X_RIGHT - 100, y: Y_START + Y_STEP * 10 },
        config: {
          actionType: "send_introduction",
          params: { type: "personal_outreach" },
        },
      },

      // Row 11a: Action — update match status
      {
        nodeId: "node_update_match_personal",
        type: "action",
        label: "Update Match — Personal Outreach",
        position: { x: X_RIGHT - 100, y: Y_START + Y_STEP * 11 },
        config: {
          actionType: "update_match_status",
          params: { final_status: "pending", response_type: "upsell_yes" },
        },
      },

      // Row 12a: End — personal outreach completed
      {
        nodeId: "node_end_personal_outreach",
        type: "end",
        label: "End — Personal Outreach Started",
        position: { x: X_RIGHT - 100, y: Y_START + Y_STEP * 12 },
        config: {
          endType: "completed",
        },
      },

      // Row 9b: Payment not received — expired
      {
        nodeId: "node_payment_expired_msg",
        type: "message",
        label: "Payment Expired Message",
        position: { x: X_RIGHT + 100, y: Y_START + Y_STEP * 9 },
        config: {
          template:
            "No worries! The Personal Outreach option is always available if you change your mind. In the meantime, we'll keep looking for great matches for you.",
          channel: "whatsapp",
        },
      },

      // Row 10b: End — payment expired
      {
        nodeId: "node_end_payment_expired",
        type: "end",
        label: "End — Payment Expired",
        position: { x: X_RIGHT + 100, y: Y_START + Y_STEP * 10 },
        config: {
          endType: "expired",
        },
      },

      // ======================================================================
      // TIMEOUT NODES
      // ======================================================================

      // End — timeout (no response at all)
      {
        nodeId: "node_end_expired",
        type: "end",
        label: "End — No Response (Expired)",
        position: { x: X_CENTER + 250, y: Y_START + Y_STEP * 4 },
        config: {
          endType: "expired",
        },
      },

      // End — decision timeout
      {
        nodeId: "node_end_decision_timeout",
        type: "end",
        label: "End — Decision Timeout",
        position: { x: X_CENTER, y: Y_START + Y_STEP * 5 },
        config: {
          endType: "expired",
        },
      },
    ];

    // ========================================================================
    // EDGES
    // ========================================================================

    const edges = [
      // Start → Initial message
      {
        edgeId: "edge_start_to_msg",
        source: "node_start",
        target: "node_initial_msg",
        label: "trigger",
      },

      // Initial message → Wait for response
      {
        edgeId: "edge_msg_to_wait",
        source: "node_initial_msg",
        target: "node_wait_response",
      },

      // Wait → Main decision (after delay or early response)
      {
        edgeId: "edge_wait_to_decision",
        source: "node_wait_response",
        target: "node_main_decision",
      },

      // Timeout from wait → expired end
      {
        edgeId: "edge_timeout_to_expired",
        source: "node_wait_response",
        target: "node_end_expired",
        label: "timeout",
      },

      // ---- BRANCH 1: INTERESTED ----

      // Main decision → Interested message
      {
        edgeId: "edge_interested",
        source: "node_main_decision",
        target: "node_interested_msg",
        label: "interested",
      },

      // Interested message → Consent decision
      {
        edgeId: "edge_interested_to_consent",
        source: "node_interested_msg",
        target: "node_consent_decision",
      },

      // Consent Yes
      {
        edgeId: "edge_consent_yes",
        source: "node_consent_decision",
        target: "node_consent_yes_msg",
        label: "yes",
      },

      // Consent Yes msg → Notify admin
      {
        edgeId: "edge_consent_yes_to_notify",
        source: "node_consent_yes_msg",
        target: "node_notify_admin_interested",
      },

      // Notify admin → Send intro
      {
        edgeId: "edge_notify_to_intro",
        source: "node_notify_admin_interested",
        target: "node_send_intro",
      },

      // Send intro → Update match
      {
        edgeId: "edge_intro_to_update",
        source: "node_send_intro",
        target: "node_update_match_interested",
      },

      // Update match → End interested
      {
        edgeId: "edge_update_to_end_interested",
        source: "node_update_match_interested",
        target: "node_end_interested",
      },

      // Consent No
      {
        edgeId: "edge_consent_no",
        source: "node_consent_decision",
        target: "node_consent_no_msg",
        label: "no",
      },

      // Consent No msg → Update match passed
      {
        edgeId: "edge_consent_no_to_update",
        source: "node_consent_no_msg",
        target: "node_update_match_passed",
      },

      // Update match passed → End passed
      {
        edgeId: "edge_update_to_end_passed",
        source: "node_update_match_passed",
        target: "node_end_passed",
      },

      // Consent timeout → End passed (treat as soft pass)
      {
        edgeId: "edge_consent_timeout",
        source: "node_consent_decision",
        target: "node_consent_no_msg",
        label: "timeout",
      },

      // ---- BRANCH 2: NOT INTERESTED ----

      // Main decision → Not interested message
      {
        edgeId: "edge_not_interested",
        source: "node_main_decision",
        target: "node_not_interested_msg",
        label: "not_interested",
      },

      // Not interested msg → Feedback collection
      {
        edgeId: "edge_not_interested_to_feedback",
        source: "node_not_interested_msg",
        target: "node_feedback_collect",
      },

      // Feedback → Sync to SMA
      {
        edgeId: "edge_feedback_to_sync",
        source: "node_feedback_collect",
        target: "node_sync_feedback_sma",
      },

      // Sync → Update match declined
      {
        edgeId: "edge_sync_to_declined",
        source: "node_sync_feedback_sma",
        target: "node_update_match_declined",
      },

      // Update declined → Check rejections
      {
        edgeId: "edge_declined_to_check",
        source: "node_update_match_declined",
        target: "node_check_rejections",
      },

      // Rejections >= 3: → Recalibration message
      {
        edgeId: "edge_recal_yes",
        source: "node_check_rejections",
        target: "node_recalibration_msg",
        label: "rejections >= 3",
        condition: "rejectionCount >= 3",
      },

      // Recalibration msg → Schedule recal
      {
        edgeId: "edge_recal_msg_to_action",
        source: "node_recalibration_msg",
        target: "node_schedule_recal",
      },

      // Schedule recal → End recalibration
      {
        edgeId: "edge_recal_to_end",
        source: "node_schedule_recal",
        target: "node_end_recalibration",
      },

      // Rejections < 3: → End not interested
      {
        edgeId: "edge_recal_no",
        source: "node_check_rejections",
        target: "node_end_not_interested",
        label: "rejections < 3",
        condition: "rejectionCount < 3",
      },

      // ---- BRANCH 3: RESCHEDULE ----

      // Main decision → Reschedule message
      {
        edgeId: "edge_reschedule",
        source: "node_main_decision",
        target: "node_reschedule_msg",
        label: "reschedule",
      },

      // Reschedule msg → Delay
      {
        edgeId: "edge_reschedule_to_delay",
        source: "node_reschedule_msg",
        target: "node_reschedule_delay",
      },

      // Delay → Follow-up message
      {
        edgeId: "edge_reschedule_delay_to_followup",
        source: "node_reschedule_delay",
        target: "node_reschedule_followup",
      },

      // Follow-up → Second decision
      {
        edgeId: "edge_followup_to_decision",
        source: "node_reschedule_followup",
        target: "node_reschedule_decision",
      },

      // Re-schedule decision → Interested (loops back to interested branch)
      {
        edgeId: "edge_resched_interested",
        source: "node_reschedule_decision",
        target: "node_interested_msg",
        label: "interested",
      },

      // Re-schedule decision → Not Interested (loops to not interested branch)
      {
        edgeId: "edge_resched_not_interested",
        source: "node_reschedule_decision",
        target: "node_not_interested_msg",
        label: "not_interested",
      },

      // Re-schedule timeout → expired
      {
        edgeId: "edge_resched_timeout",
        source: "node_reschedule_decision",
        target: "node_end_reschedule_expired",
        label: "timeout",
      },

      // ---- BRANCH 4: WANTS TO MEET (Personal Outreach) ----

      // Main decision → Personal outreach message
      {
        edgeId: "edge_wants_to_meet",
        source: "node_main_decision",
        target: "node_personal_outreach_msg",
        label: "wants_to_meet",
      },

      // Personal outreach msg → Create Stripe link
      {
        edgeId: "edge_outreach_to_stripe",
        source: "node_personal_outreach_msg",
        target: "node_create_stripe_link",
      },

      // Create Stripe link → Send payment link msg
      {
        edgeId: "edge_stripe_to_payment_msg",
        source: "node_create_stripe_link",
        target: "node_payment_link_msg",
      },

      // Payment link msg → Delay 24h
      {
        edgeId: "edge_payment_msg_to_delay",
        source: "node_payment_link_msg",
        target: "node_payment_delay",
      },

      // Delay → Check payment
      {
        edgeId: "edge_payment_delay_to_check",
        source: "node_payment_delay",
        target: "node_check_payment",
      },

      // Payment timeout → Check payment (same check)
      {
        edgeId: "edge_payment_timeout",
        source: "node_payment_delay",
        target: "node_check_payment",
        label: "timeout",
      },

      // Payment yes → Confirmed message
      {
        edgeId: "edge_payment_yes",
        source: "node_check_payment",
        target: "node_payment_confirmed_msg",
        label: "payment_received",
        condition: "paymentReceived == true",
      },

      // Confirmed msg → Personal intro action
      {
        edgeId: "edge_confirmed_to_intro",
        source: "node_payment_confirmed_msg",
        target: "node_personal_intro_action",
      },

      // Personal intro → Update match
      {
        edgeId: "edge_personal_intro_to_update",
        source: "node_personal_intro_action",
        target: "node_update_match_personal",
      },

      // Update match → End personal outreach
      {
        edgeId: "edge_personal_update_to_end",
        source: "node_update_match_personal",
        target: "node_end_personal_outreach",
      },

      // Payment no → Expired message
      {
        edgeId: "edge_payment_no",
        source: "node_check_payment",
        target: "node_payment_expired_msg",
        label: "no_payment",
        condition: "paymentReceived != true",
      },

      // Expired msg → End payment expired
      {
        edgeId: "edge_payment_expired_to_end",
        source: "node_payment_expired_msg",
        target: "node_end_payment_expired",
      },

      // ---- TIMEOUT FROM MAIN DECISION ----

      // Main decision timeout → end
      {
        edgeId: "edge_timeout_decision",
        source: "node_main_decision",
        target: "node_end_decision_timeout",
        label: "timeout",
      },
    ];

    // ========================================================================
    // INSERT FLOW DEFINITION
    // ========================================================================

    const flowDefinitionId = await ctx.db.insert("flowDefinitions", {
      name: "Match Feedback Flow v1",
      type: "match_feedback",
      description:
        "Dani's core feedback tree — triggered every time a match is created. Handles 4 member response types: Interested, Not Interested, Reschedule, and Wants to Meet (Personal Outreach). Includes feedback collection, SMA sync, rejection-based recalibration, and Stripe payment integration.",
      nodes,
      edges,
      version: 1,
      isActive: true,
      isDefault: true,
      createdBy: "system_seed",
      createdAt: now,
      updatedAt: now,
    });

    return { alreadyExists: false, flowDefinitionId };
  },
});
