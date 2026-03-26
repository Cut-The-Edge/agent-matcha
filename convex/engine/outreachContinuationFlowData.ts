// @ts-nocheck
/**
 * Outreach Continuation Flow — Convex Schema Format
 *
 * Triggered when Dani records an outreach outcome in the Action Queue.
 * Three branches based on outcome:
 *
 *   A) Match Interested → Send brief + offer → member chooses Yes/No
 *      → Yes: second $125 payment → share contact info → "Successful Introductions"
 *      → No: move to "Rejected Introductions"
 *
 *   B) Match Not Interested → Notify member with soft message → "Past Introductions"
 *
 *   C) Match No Response → Ask member: keep trying or move on?
 *      → Keep trying: set follow-up reminder
 *      → Move on: "Past Introductions"
 *
 * The outcome is passed via initialContext.outreachOutcome when the flow starts.
 * A CONDITION node routes to the correct branch immediately.
 */

export const FLOW_NAME = "Outreach Continuation Flow";
export const FLOW_TYPE = "outreach_continuation";
export const FLOW_DESCRIPTION =
  "Handles WhatsApp continuation after Dani records an outreach outcome. " +
  "Routes to match-interested (brief + payment), match-declined (notify member), " +
  "or no-response (member choice) branches.";

export const nodes = [
  // ═══════════════════════════════════════════════════════════════════════════
  // START + ROUTE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    nodeId: "oc_start",
    type: "start",
    label: "Outreach Outcome Recorded",
    position: { x: 1000, y: 0 },
    config: { triggerType: "admin_action" },
  },

  // Two chained binary conditions to route 3 outcomes:
  //   interested? → yes → Branch A
  //                 no  → not_interested? → yes → Branch B
  //                                         no  → Branch C (no_response)
  {
    nodeId: "oc_check_interested",
    type: "condition",
    label: "Is Match Interested?",
    position: { x: 1000, y: 200 },
    config: {
      expression: "outreachOutcome == match_interested",
      trueEdgeId: "oc_edge_interested",
      falseEdgeId: "oc_edge_not_interested_check",
    },
  },

  {
    nodeId: "oc_check_declined",
    type: "condition",
    label: "Is Match Declined?",
    position: { x: 1300, y: 400 },
    config: {
      expression: "outreachOutcome == match_not_interested",
      trueEdgeId: "oc_edge_declined",
      falseEdgeId: "oc_edge_no_response",
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BRANCH A: MATCH INTERESTED
  // ═══════════════════════════════════════════════════════════════════════════

  // Send the intelligence brief + offer to the paying member
  {
    nodeId: "oc_msg_brief_offer",
    type: "message",
    label: "Send Brief + Connection Offer",
    position: { x: 400, y: 500 },
    config: {
      template:
        "I connected with {{matchFirstName}} and gathered some additional insight beyond the profile.\n\n" +
        "They are open to the introduction, and I've included a brief summary of what I learned below.\n\n" +
        "{{intelligenceBrief}}\n\n" +
        "If you'd like to move forward with the connection, the remaining $125 is required to complete the introduction.\n\n" +
        "Once confirmed, I'll share their contact information with you so you can reach out.",
      channel: "whatsapp",
      templateKey: "OUTREACH_MATCH_INTERESTED",
    },
  },

  // Member chooses: Yes – Connect Us / No – I'll Pass
  {
    nodeId: "oc_decision_connect",
    type: "decision",
    label: "Connect or Pass?",
    position: { x: 400, y: 800 },
    config: {
      question: "Would you like to move forward with the connection?",
      options: [
        { value: "yes_connect", label: "Yes – Connect Us", edgeId: "oc_edge_yes_connect" },
        { value: "no_pass", label: "No – I'll Pass", edgeId: "oc_edge_no_pass" },
      ],
      timeout: 172800000, // 2 days
      timeoutEdgeId: "oc_edge_connect_timeout",
    },
  },

  // ── YES PATH: Second payment ──

  {
    nodeId: "oc_msg_payment_link",
    type: "message",
    label: "Send Second Payment Link",
    position: { x: 100, y: 1100 },
    config: {
      template:
        "Great — please complete the remaining $125 payment here to finalize the introduction.",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_action_create_payment",
    type: "action",
    label: "Create Completion Payment",
    position: { x: 100, y: 1400 },
    config: {
      actionType: "create_stripe_link",
      params: {
        amount: 12500, // $125 in cents
        phase: "completion",
        description: "Personal outreach — connection completion",
      },
    },
  },

  // After payment confirmed → share contact info
  {
    nodeId: "oc_msg_contact_shared",
    type: "message",
    label: "Share Contact Info",
    position: { x: 100, y: 1700 },
    config: {
      template:
        "Perfect — we're moving forward with the connection.\n\n" +
        "Here are {{matchFirstName}}'s contact details:\n" +
        "{{matchPhone}}\n\n" +
        "I just spoke with them and they're expecting to hear from you, so feel free to send a quick text to say hello.\n\n" +
        "If helpful, here's a simple example:\n" +
        "\"Hi {{matchFirstName}}, this is {{memberFirstName}}. Dani from Club Allenby mentioned you might be someone I'd enjoy meeting and shared your number. Nice to connect. How are you?\"",
      channel: "whatsapp",
      templateKey: "OUTREACH_CONTACT_SHARED",
    },
  },

  {
    nodeId: "oc_action_successful_intro",
    type: "action",
    label: "Mark Successful Introduction",
    position: { x: 100, y: 2000 },
    config: {
      actionType: "update_match_status",
      params: {
        status: "completed",
        response_type: "upsell_yes",
        final_status: "completed",
      },
    },
  },

  {
    nodeId: "oc_end_connected",
    type: "end",
    label: "Successful Introduction",
    position: { x: 100, y: 2300 },
    config: { endType: "completed" },
  },

  // ── NO PATH: Member passes ──

  {
    nodeId: "oc_msg_member_passed",
    type: "message",
    label: "Member Passed",
    position: { x: 700, y: 1100 },
    config: {
      template:
        "Understood. We'll move {{matchFirstName}} to your Past Introductions for now.\n\n" +
        "If you change your mind later, just message us their name and we can reopen it.\n\n" +
        "No additional payment is required.",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_action_reject_intro",
    type: "action",
    label: "Reject Introduction",
    position: { x: 700, y: 1400 },
    config: {
      actionType: "update_match_status",
      params: {
        status: "rejected",
        response_type: "upsell_no_pass",
        final_status: "rejected",
      },
    },
  },

  {
    nodeId: "oc_end_member_passed",
    type: "end",
    label: "Member Passed",
    position: { x: 700, y: 1700 },
    config: { endType: "completed" },
  },

  // ── TIMEOUT: No response to connect choice ──

  {
    nodeId: "oc_msg_connect_nudge",
    type: "message",
    label: "Nudge: Connect Choice",
    position: { x: 400, y: 1100 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in — would you like to move forward with the connection to {{matchFirstName}}?",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_decision_connect_reask",
    type: "decision",
    label: "Connect or Pass? (Re-ask)",
    position: { x: 400, y: 1400 },
    config: {
      question: "Would you like to move forward?",
      options: [
        { value: "yes_connect", label: "Yes – Connect Us", edgeId: "oc_edge_reask_yes" },
        { value: "no_pass", label: "No – I'll Pass", edgeId: "oc_edge_reask_no" },
      ],
      timeout: 172800000, // 2 more days
      timeoutEdgeId: "oc_edge_reask_timeout",
    },
  },

  {
    nodeId: "oc_msg_connect_expired",
    type: "message",
    label: "Connection Offer Expired",
    position: { x: 400, y: 1700 },
    config: {
      template:
        "No worries — since I didn't hear back, I'll keep this open for now. Just message us anytime if you'd like to reconnect with {{matchFirstName}}.",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_end_connect_expired",
    type: "end",
    label: "Connect Offer Expired",
    position: { x: 400, y: 2000 },
    config: { endType: "expired" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BRANCH B: MATCH NOT INTERESTED
  // ═══════════════════════════════════════════════════════════════════════════

  {
    nodeId: "oc_msg_match_declined",
    type: "message",
    label: "Notify: Match Declined",
    position: { x: 1000, y: 500 },
    config: {
      template:
        "I connected with {{matchFirstName}} and explored the potential introduction.\n\n" +
        "After speaking with them, they've decided not to move forward with the connection at this time. " +
        "{{declineInsight}}" +
        "We'll move this match to Past Introductions and continue focusing on finding stronger alignment for you.\n\n" +
        "Thanks for trusting us to explore it — on to the next one!",
      channel: "whatsapp",
      templateKey: "OUTREACH_MATCH_DECLINED",
    },
  },

  {
    nodeId: "oc_action_match_declined",
    type: "action",
    label: "Move to Past Introductions",
    position: { x: 1000, y: 800 },
    config: {
      actionType: "update_match_status",
      params: {
        status: "past",
        response_type: "upsell_no_pass",
        final_status: "past",
      },
    },
  },

  {
    nodeId: "oc_end_declined",
    type: "end",
    label: "Match Declined — Done",
    position: { x: 1000, y: 1100 },
    config: { endType: "completed" },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BRANCH C: MATCH NO RESPONSE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    nodeId: "oc_msg_no_response",
    type: "message",
    label: "Notify: No Response Yet",
    position: { x: 1600, y: 500 },
    config: {
      template:
        "Quick update — we've tried reaching {{matchFirstName}} but haven't been able to connect with them yet. " +
        "This happens occasionally, so just wanted to check how you'd like to proceed.",
      channel: "whatsapp",
      templateKey: "OUTREACH_NO_RESPONSE",
    },
  },

  {
    nodeId: "oc_decision_retry",
    type: "decision",
    label: "Keep Trying or Move On?",
    position: { x: 1600, y: 800 },
    config: {
      question: "How would you like to proceed?",
      options: [
        { value: "keep_trying", label: "Keep trying", edgeId: "oc_edge_keep_trying" },
        { value: "find_next", label: "Find the next match", edgeId: "oc_edge_find_next" },
      ],
      timeout: 172800000, // 2 days
      timeoutEdgeId: "oc_edge_retry_timeout",
    },
  },

  // ── Keep Trying ──

  {
    nodeId: "oc_msg_keep_trying",
    type: "message",
    label: "Acknowledge: Keep Trying",
    position: { x: 1300, y: 1100 },
    config: {
      template:
        "Got it — we'll keep trying and will let you know if we're able to connect with them.",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_end_keep_trying",
    type: "end",
    label: "Keep Trying — Follow-up Set",
    position: { x: 1300, y: 1400 },
    config: { endType: "completed" },
  },

  // ── Find Next Match ──

  {
    nodeId: "oc_msg_find_next",
    type: "message",
    label: "Acknowledge: Find Next",
    position: { x: 1900, y: 1100 },
    config: {
      template:
        "No problem — we'll move {{matchFirstName}} to your Past Introductions and focus on finding the next match for you.",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_action_move_past",
    type: "action",
    label: "Move to Past Introductions",
    position: { x: 1900, y: 1400 },
    config: {
      actionType: "update_match_status",
      params: {
        status: "past",
        response_type: "no_response",
        final_status: "past",
      },
    },
  },

  {
    nodeId: "oc_end_find_next",
    type: "end",
    label: "Find Next — Done",
    position: { x: 1900, y: 1700 },
    config: { endType: "completed" },
  },

  // ── Retry Timeout ──

  {
    nodeId: "oc_msg_retry_timeout",
    type: "message",
    label: "Retry Choice Timeout",
    position: { x: 1600, y: 1100 },
    config: {
      template:
        "We'll keep this open for now — just message us anytime about {{matchFirstName}}.",
      channel: "whatsapp",
    },
  },

  {
    nodeId: "oc_end_retry_timeout",
    type: "end",
    label: "Retry Timeout — Done",
    position: { x: 1600, y: 1400 },
    config: { endType: "expired" },
  },
];

export const edges = [
  // START → ROUTE (chained binary conditions)
  { edgeId: "oc_edge_start_route", source: "oc_start", target: "oc_check_interested" },

  // Check 1: Interested?
  { edgeId: "oc_edge_interested", source: "oc_check_interested", target: "oc_msg_brief_offer", label: "Match Interested" },
  { edgeId: "oc_edge_not_interested_check", source: "oc_check_interested", target: "oc_check_declined", label: "Not Interested — check declined" },

  // Check 2: Declined or No Response?
  { edgeId: "oc_edge_declined", source: "oc_check_declined", target: "oc_msg_match_declined", label: "Match Declined" },
  { edgeId: "oc_edge_no_response", source: "oc_check_declined", target: "oc_msg_no_response", label: "No Response" },

  // ── BRANCH A: INTERESTED ──
  { edgeId: "oc_edge_brief_to_decision", source: "oc_msg_brief_offer", target: "oc_decision_connect" },
  { edgeId: "oc_edge_yes_connect", source: "oc_decision_connect", target: "oc_msg_payment_link", label: "Yes – Connect Us", condition: "yes_connect" },
  { edgeId: "oc_edge_no_pass", source: "oc_decision_connect", target: "oc_msg_member_passed", label: "No – I'll Pass", condition: "no_pass" },
  { edgeId: "oc_edge_connect_timeout", source: "oc_decision_connect", target: "oc_msg_connect_nudge", label: "Timeout", condition: "timeout" },

  // Yes → Payment → Contact
  { edgeId: "oc_edge_payment_link", source: "oc_msg_payment_link", target: "oc_action_create_payment" },
  { edgeId: "oc_edge_payment_done", source: "oc_action_create_payment", target: "oc_msg_contact_shared", label: "Payment Completed", condition: "payment_completed" },
  { edgeId: "oc_edge_contact_to_success", source: "oc_msg_contact_shared", target: "oc_action_successful_intro" },
  { edgeId: "oc_edge_success_end", source: "oc_action_successful_intro", target: "oc_end_connected" },

  // No → Passed
  { edgeId: "oc_edge_passed_to_reject", source: "oc_msg_member_passed", target: "oc_action_reject_intro" },
  { edgeId: "oc_edge_reject_end", source: "oc_action_reject_intro", target: "oc_end_member_passed" },

  // Timeout → Nudge → Re-ask
  { edgeId: "oc_edge_nudge_to_reask", source: "oc_msg_connect_nudge", target: "oc_decision_connect_reask" },
  { edgeId: "oc_edge_reask_yes", source: "oc_decision_connect_reask", target: "oc_msg_payment_link", label: "Yes – Connect Us", condition: "yes_connect" },
  { edgeId: "oc_edge_reask_no", source: "oc_decision_connect_reask", target: "oc_msg_member_passed", label: "No – I'll Pass", condition: "no_pass" },
  { edgeId: "oc_edge_reask_timeout", source: "oc_decision_connect_reask", target: "oc_msg_connect_expired", label: "Final Timeout", condition: "timeout" },
  { edgeId: "oc_edge_expired_end", source: "oc_msg_connect_expired", target: "oc_end_connect_expired" },

  // ── BRANCH B: DECLINED ──
  { edgeId: "oc_edge_declined_action", source: "oc_msg_match_declined", target: "oc_action_match_declined" },
  { edgeId: "oc_edge_declined_end", source: "oc_action_match_declined", target: "oc_end_declined" },

  // ── BRANCH C: NO RESPONSE ──
  { edgeId: "oc_edge_no_resp_to_decision", source: "oc_msg_no_response", target: "oc_decision_retry" },
  { edgeId: "oc_edge_keep_trying", source: "oc_decision_retry", target: "oc_msg_keep_trying", label: "Keep trying", condition: "keep_trying" },
  { edgeId: "oc_edge_find_next", source: "oc_decision_retry", target: "oc_msg_find_next", label: "Find the next match", condition: "find_next" },
  { edgeId: "oc_edge_retry_timeout", source: "oc_decision_retry", target: "oc_msg_retry_timeout", label: "Timeout", condition: "timeout" },

  { edgeId: "oc_edge_keep_end", source: "oc_msg_keep_trying", target: "oc_end_keep_trying" },
  { edgeId: "oc_edge_find_next_action", source: "oc_msg_find_next", target: "oc_action_move_past" },
  { edgeId: "oc_edge_move_past_end", source: "oc_action_move_past", target: "oc_end_find_next" },
  { edgeId: "oc_edge_retry_timeout_end", source: "oc_msg_retry_timeout", target: "oc_end_retry_timeout" },
];
