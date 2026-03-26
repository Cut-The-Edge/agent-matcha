// @ts-nocheck
/**
 * Post-Date Feedback Flow — Convex Schema Format
 *
 * Triggered when a match moves to "Successful Introductions" in SMA.
 * Collects structured feedback from BOTH members after a date,
 * generates a Compatibility Score, and feeds the matchmaker intelligence system.
 *
 * One flow instance is started per member (2 per match).
 *
 * Flow Structure (matches Dani's spec):
 *   Phase 1 — Pre-check: "Were you able to connect?" → "Did you end up meeting?"
 *   Phase 2 — Feedback: Chemistry? → See again? → Anything to adjust? (free text)
 *   Phase 3 — Routing: Not a match → "What felt misaligned?" / Positive → close
 *   Phase 4 — Score: Generate compatibility score, check bad dates, end
 *
 * "Not yet" paths wait 3 days and re-ask once before closing.
 * No-response paths: 24h reminder → re-ask → 48h close.
 */

export const FLOW_NAME = "Post-Date Feedback Flow";
export const FLOW_TYPE = "post_date_feedback";
export const FLOW_DESCRIPTION =
  "Collects post-date feedback from both members after a successful introduction. " +
  "Checks if they connected and met, collects chemistry/see-again/free-text feedback, " +
  "generates Compatibility Scores, and triggers recalibration when needed.";

export const nodes = [
  // ═════════════════════════════════════════════════════════════════════════════
  // PHASE 1 — PRE-CHECK: Did they connect? Did they meet?
  // ═════════════════════════════════════════════════════════════════════════════

  {
    nodeId: "pdf_start",
    type: "start",
    label: "Successful Introduction",
    position: { x: 2000, y: 0 },
    config: { triggerType: "webhook" },
  },
  {
    nodeId: "pdf_delay_settle",
    type: "delay",
    label: "Wait 24h After Intro",
    position: { x: 2000, y: 300 },
    config: { duration: 24, unit: "hours" },
  },

  // Step 1: Were you able to connect?
  {
    nodeId: "pdf_decision_connected",
    type: "decision",
    label: "Were You Able to Connect?",
    position: { x: 2000, y: 700 },
    config: {
      question:
        "Hey {{memberFirstName}}! Were you able to connect with {{matchFirstName}}?",
      options: [
        { value: "yes_connected", label: "Yes we connected", edgeId: "pdf_edge_connected_yes" },
        { value: "not_yet", label: "Not yet", edgeId: "pdf_edge_connected_not_yet" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "pdf_edge_connected_timeout",
      templateKey: "POST_DATE_CONNECT_CHECK",
    },
  },

  // "Not yet" → wait 3 days → re-ask
  {
    nodeId: "pdf_msg_not_connected",
    type: "message",
    label: "Not Connected Yet",
    position: { x: 800, y: 1100 },
    config: {
      template:
        "No problem — sometimes timing is everything. Feel free to reach out whenever it feels right.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "pdf_delay_reconnect",
    type: "delay",
    label: "Wait 3 Days to Reconnect",
    position: { x: 800, y: 1500 },
    config: { duration: 3, unit: "days" },
  },
  {
    nodeId: "pdf_decision_reconnect",
    type: "decision",
    label: "Re-Ask: Connected?",
    position: { x: 800, y: 1900 },
    config: {
      question:
        "Hey {{memberFirstName}}, just checking back — were you able to connect with {{matchFirstName}}?",
      options: [
        { value: "yes_connected", label: "Yes we connected", edgeId: "pdf_edge_reconnect_yes" },
        { value: "not_yet", label: "Not yet", edgeId: "pdf_edge_reconnect_not_yet" },
      ],
      timeout: 172800000, // 48h
      timeoutEdgeId: "pdf_edge_reconnect_timeout",
    },
  },

  // Step 2: Did you end up meeting?
  {
    nodeId: "pdf_decision_did_meet",
    type: "decision",
    label: "Did You End Up Meeting?",
    position: { x: 2000, y: 1300 },
    config: {
      question: "Great! Did you end up meeting?",
      options: [
        { value: "yes_met", label: "Yes", edgeId: "pdf_edge_met_yes" },
        { value: "not_yet", label: "Not yet", edgeId: "pdf_edge_met_not_yet" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "pdf_edge_met_timeout",
    },
  },

  // "Not yet met" → wait 3 days → re-ask
  {
    nodeId: "pdf_msg_not_met",
    type: "message",
    label: "Not Met Yet",
    position: { x: 1400, y: 1700 },
    config: {
      template: "No problem — take your time, there's no rush!",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "pdf_delay_recheck_met",
    type: "delay",
    label: "Wait 3 Days to Recheck",
    position: { x: 1400, y: 2100 },
    config: { duration: 3, unit: "days" },
  },
  {
    nodeId: "pdf_decision_recheck_met",
    type: "decision",
    label: "Re-Ask: Did You Meet?",
    position: { x: 1400, y: 2500 },
    config: {
      question: "Hey {{memberFirstName}}, just checking back — did you end up meeting with {{matchFirstName}}?",
      options: [
        { value: "yes_met", label: "Yes", edgeId: "pdf_edge_recheck_met_yes" },
        { value: "not_yet", label: "Not yet", edgeId: "pdf_edge_recheck_met_not_yet" },
      ],
      timeout: 172800000, // 48h
      timeoutEdgeId: "pdf_edge_recheck_met_timeout",
    },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — FEEDBACK COLLECTION (linear: chemistry → see again → free text)
  // ═════════════════════════════════════════════════════════════════════════════

  // Q1: How was the chemistry?
  {
    nodeId: "pdf_decision_chemistry",
    type: "decision",
    label: "How Was the Chemistry?",
    position: { x: 2000, y: 2000 },
    config: {
      question: "How was the chemistry?",
      options: [
        { value: "great", label: "Great", edgeId: "pdf_edge_chem_great" },
        { value: "good", label: "Good", edgeId: "pdf_edge_chem_good" },
        { value: "neutral", label: "Neutral", edgeId: "pdf_edge_chem_neutral" },
        { value: "not_a_match", label: "Not a match", edgeId: "pdf_edge_chem_not_match" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_chem_timeout",
    },
  },

  // Q2: Would you see them again?
  {
    nodeId: "pdf_decision_see_again",
    type: "decision",
    label: "Would You See Them Again?",
    position: { x: 2000, y: 2600 },
    config: {
      question: "Would you see them again?",
      options: [
        { value: "yes", label: "Yes", edgeId: "pdf_edge_see_yes" },
        { value: "maybe", label: "Maybe", edgeId: "pdf_edge_see_maybe" },
        { value: "no", label: "No", edgeId: "pdf_edge_see_no" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_see_timeout",
    },
  },

  // Q3: Anything you'd adjust about future matches? (free text)
  {
    nodeId: "pdf_fb_adjust",
    type: "feedback_collect",
    label: "Anything to Adjust?",
    position: { x: 2000, y: 3200 },
    config: {
      feedbackType: "adjust_future",
      prompt: "Anything you'd adjust about future matches?",
      categories: [],
      allowFreeText: true,
      timeout: 86400000, // 24h — if no response, just proceed
    },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // PHASE 3 — SAVE + ROUTE based on chemistry answer
  // ═════════════════════════════════════════════════════════════════════════════

  // Save feedback (reads all collected data from context)
  {
    nodeId: "pdf_action_save",
    type: "action",
    label: "Save Date Feedback",
    position: { x: 2000, y: 3700 },
    config: {
      actionType: "save_date_feedback",
      params: {},
    },
  },

  // Route: was it "not a match"?
  {
    nodeId: "pdf_condition_not_match",
    type: "condition",
    label: "Not a Match?",
    position: { x: 2000, y: 4100 },
    config: {
      expression: "memberDecision == not_a_match",
      trueEdgeId: "pdf_edge_route_negative",
      falseEdgeId: "pdf_edge_route_positive",
    },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // POSITIVE / NEUTRAL PATH
  // ═════════════════════════════════════════════════════════════════════════════

  {
    nodeId: "pdf_msg_thanks",
    type: "message",
    label: "Thanks for Sharing",
    position: { x: 2500, y: 4500 },
    config: {
      template:
        "Thanks for sharing {{memberFirstName}} — this genuinely helps us improve your future matches. We'll keep refining!",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "pdf_action_css_pos",
    type: "action",
    label: "Generate Compatibility Score",
    position: { x: 2500, y: 4900 },
    config: {
      actionType: "generate_css",
      params: {},
    },
  },
  {
    nodeId: "pdf_end_pos",
    type: "end",
    label: "End (Feedback Complete)",
    position: { x: 2500, y: 5300 },
    config: { endType: "completed" },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // NEGATIVE PATH — "Not a match" → collect structured data
  // ═════════════════════════════════════════════════════════════════════════════

  {
    nodeId: "pdf_decision_misaligned",
    type: "decision",
    label: "What Felt Misaligned?",
    position: { x: 1200, y: 4500 },
    config: {
      question: "Totally understand. What felt misaligned?",
      options: [
        { value: "lifestyle", label: "Lifestyle", edgeId: "pdf_edge_mis_lifestyle" },
        { value: "attraction", label: "Attraction", edgeId: "pdf_edge_mis_attraction" },
        { value: "communication", label: "Communication", edgeId: "pdf_edge_mis_comm" },
        { value: "values", label: "Values", edgeId: "pdf_edge_mis_values" },
        { value: "energy", label: "Energy", edgeId: "pdf_edge_mis_energy" },
        { value: "other", label: "Other", edgeId: "pdf_edge_mis_other" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_mis_timeout",
    },
  },
  {
    nodeId: "pdf_msg_thanks_neg",
    type: "message",
    label: "Thanks (Negative)",
    position: { x: 1200, y: 5100 },
    config: {
      template:
        "Thanks for sharing {{memberFirstName}} — this genuinely helps us improve your future matches. We'll keep refining intentionally.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "pdf_action_css_neg",
    type: "action",
    label: "Generate Compatibility Score (Neg)",
    position: { x: 1200, y: 5500 },
    config: {
      actionType: "generate_css",
      params: {},
    },
  },

  // Check consecutive bad dates → recalibration trigger
  {
    nodeId: "pdf_condition_bad_dates",
    type: "condition",
    label: "Check Bad Dates Count",
    position: { x: 1200, y: 5900 },
    config: {
      expression: "consecutiveBadDates >= 2",
      trueEdgeId: "pdf_edge_recalibrate",
      falseEdgeId: "pdf_edge_neg_end",
    },
  },
  {
    nodeId: "pdf_msg_recalibrate",
    type: "message",
    label: "Recalibration Suggestion",
    position: { x: 600, y: 6300 },
    config: {
      template:
        "We've noticed the last couple of introductions didn't quite land. It might help to have a quick recalibration conversation — we want to make sure we're on the right track for you.\n\nWe'll reach out to set one up.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "pdf_action_human_review",
    type: "action",
    label: "Trigger Human Review",
    position: { x: 600, y: 6700 },
    config: {
      actionType: "trigger_human_review",
      params: {
        reason: "consecutive_bad_dates",
        notification: "Post-date recalibration needed — {{memberFirstName}} has had {{consecutiveBadDates}} unsuccessful dates in a row.",
      },
    },
  },
  {
    nodeId: "pdf_end_recalibrate",
    type: "end",
    label: "End (Recalibration)",
    position: { x: 600, y: 7100 },
    config: { endType: "completed" },
  },
  {
    nodeId: "pdf_end_neg",
    type: "end",
    label: "End (Not a Match)",
    position: { x: 1200, y: 6400 },
    config: { endType: "completed" },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // CLOSE LOOPS — "Not yet" paths that exhaust retries
  // ═════════════════════════════════════════════════════════════════════════════

  {
    nodeId: "pdf_msg_close_no_connect",
    type: "message",
    label: "Close — Didn't Connect",
    position: { x: 400, y: 2500 },
    config: {
      template:
        "No worries {{memberFirstName}} — we'll keep this logged and continue refining your next introduction. If you'd like to share feedback later, just message us anytime.",
      channel: "whatsapp",
      templateKey: "POST_DATE_CLOSE_LOOP",
    },
  },
  {
    nodeId: "pdf_action_close_no_connect",
    type: "action",
    label: "Close Loop (No Connect)",
    position: { x: 400, y: 2900 },
    config: { actionType: "close_feedback_loop", params: { reason: "no_connect" } },
  },
  {
    nodeId: "pdf_end_no_connect",
    type: "end",
    label: "End (Didn't Connect)",
    position: { x: 400, y: 3300 },
    config: { endType: "completed" },
  },

  {
    nodeId: "pdf_msg_close_no_meet",
    type: "message",
    label: "Close — Didn't Meet",
    position: { x: 1000, y: 3100 },
    config: {
      template:
        "No worries {{memberFirstName}} — we'll keep this logged and continue refining your next introduction. If you do end up meeting, just message us!",
      channel: "whatsapp",
      templateKey: "POST_DATE_CLOSE_LOOP",
    },
  },
  {
    nodeId: "pdf_action_close_no_meet",
    type: "action",
    label: "Close Loop (No Meet)",
    position: { x: 1000, y: 3500 },
    config: { actionType: "close_feedback_loop", params: { reason: "no_meet" } },
  },
  {
    nodeId: "pdf_end_no_meet",
    type: "end",
    label: "End (Didn't Meet)",
    position: { x: 1000, y: 3900 },
    config: { endType: "completed" },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // NO RESPONSE CHAIN — initial question got no reply
  // ═════════════════════════════════════════════════════════════════════════════

  {
    nodeId: "pdf_msg_reminder_1",
    type: "message",
    label: "Reminder (24h)",
    position: { x: 3200, y: 1100 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in — quick feedback helps us refine future matches for you. No rush!",
      channel: "whatsapp",
      templateKey: "POST_DATE_REMINDER",
    },
  },
  {
    nodeId: "pdf_decision_reask_connected",
    type: "decision",
    label: "Re-Ask: Connected? (Reminder)",
    position: { x: 3200, y: 1600 },
    config: {
      question: "Were you able to connect with {{matchFirstName}}?",
      options: [
        { value: "yes_connected", label: "Yes we connected", edgeId: "pdf_edge_reask_conn_yes" },
        { value: "not_yet", label: "Not yet", edgeId: "pdf_edge_reask_conn_not_yet" },
      ],
      timeout: 172800000, // 48h
      timeoutEdgeId: "pdf_edge_reask_conn_timeout",
      templateKey: "POST_DATE_REASK",
    },
  },
  {
    nodeId: "pdf_msg_close_loop",
    type: "message",
    label: "Close Loop (No Response)",
    position: { x: 3200, y: 2200 },
    config: {
      template:
        "No worries {{memberFirstName}} — we'll log this match and continue refining your next introduction. If you'd like to share feedback later, just message us anytime.",
      channel: "whatsapp",
      templateKey: "POST_DATE_CLOSE_LOOP",
    },
  },
  {
    nodeId: "pdf_action_close_loop",
    type: "action",
    label: "Close Feedback Loop",
    position: { x: 3200, y: 2600 },
    config: { actionType: "close_feedback_loop", params: {} },
  },
  {
    nodeId: "pdf_end_no_response",
    type: "end",
    label: "End (No Response)",
    position: { x: 3200, y: 3000 },
    config: { endType: "completed" },
  },

  // ═════════════════════════════════════════════════════════════════════════════
  // NUDGE + RE-ASK NODES (mid-flow timeouts → nudge → re-ask → expire)
  // ═════════════════════════════════════════════════════════════════════════════

  {
    nodeId: "pdf_msg_midflow_expire",
    type: "message",
    label: "Mid-Flow Expire",
    position: { x: 3600, y: 4000 },
    config: {
      template:
        "No worries {{memberFirstName}} — since I haven't heard back, I'll close this out for now. If you'd like to share feedback later, just message us anytime.",
      channel: "whatsapp",
      templateKey: "POST_DATE_MIDFLOW_EXPIRE",
    },
  },

  // Nudge messages
  {
    nodeId: "pdf_msg_nudge_met",
    type: "message",
    label: "Nudge — Did You Meet",
    position: { x: 2600, y: 1300 },
    config: {
      template: "Hey {{memberFirstName}}, just checking in — no pressure at all!",
      channel: "whatsapp",
      templateKey: "POST_DATE_NUDGE",
    },
  },
  {
    nodeId: "pdf_msg_nudge_chem",
    type: "message",
    label: "Nudge — Chemistry",
    position: { x: 2600, y: 2000 },
    config: {
      template: "Hey {{memberFirstName}}, take your time — your honest feedback really helps us improve!",
      channel: "whatsapp",
      templateKey: "POST_DATE_NUDGE",
    },
  },
  {
    nodeId: "pdf_msg_nudge_see",
    type: "message",
    label: "Nudge — See Again",
    position: { x: 2600, y: 2600 },
    config: {
      template: "Hey {{memberFirstName}}, no rush at all!",
      channel: "whatsapp",
      templateKey: "POST_DATE_NUDGE",
    },
  },
  {
    nodeId: "pdf_msg_nudge_mis",
    type: "message",
    label: "Nudge — Misaligned",
    position: { x: 700, y: 4500 },
    config: {
      template: "Hey {{memberFirstName}}, take your time — no pressure at all.",
      channel: "whatsapp",
      templateKey: "POST_DATE_NUDGE",
    },
  },

  // Re-ask decision nodes (after nudge, 24h timeout → expire)
  {
    nodeId: "pdf_reask_met",
    type: "decision",
    label: "Re-Ask: Did You Meet?",
    position: { x: 2600, y: 1700 },
    config: {
      question: "Did you end up meeting with {{matchFirstName}}?",
      options: [
        { value: "yes_met", label: "Yes", edgeId: "pdf_edge_ra_met_yes" },
        { value: "not_yet", label: "Not yet", edgeId: "pdf_edge_ra_met_not_yet" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_ra_met_expire",
    },
  },
  {
    nodeId: "pdf_reask_chem",
    type: "decision",
    label: "Re-Ask: Chemistry?",
    position: { x: 2600, y: 2400 },
    config: {
      question: "How was the chemistry with {{matchFirstName}}?",
      options: [
        { value: "great", label: "Great", edgeId: "pdf_edge_ra_chem_great" },
        { value: "good", label: "Good", edgeId: "pdf_edge_ra_chem_good" },
        { value: "neutral", label: "Neutral", edgeId: "pdf_edge_ra_chem_neutral" },
        { value: "not_a_match", label: "Not a match", edgeId: "pdf_edge_ra_chem_not_match" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_ra_chem_expire",
    },
  },
  {
    nodeId: "pdf_reask_see",
    type: "decision",
    label: "Re-Ask: See Again?",
    position: { x: 2600, y: 3000 },
    config: {
      question: "Would you see {{matchFirstName}} again?",
      options: [
        { value: "yes", label: "Yes", edgeId: "pdf_edge_ra_see_yes" },
        { value: "maybe", label: "Maybe", edgeId: "pdf_edge_ra_see_maybe" },
        { value: "no", label: "No", edgeId: "pdf_edge_ra_see_no" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_ra_see_expire",
    },
  },
  {
    nodeId: "pdf_reask_mis",
    type: "decision",
    label: "Re-Ask: Misaligned?",
    position: { x: 700, y: 4900 },
    config: {
      question: "What felt misaligned?",
      options: [
        { value: "lifestyle", label: "Lifestyle", edgeId: "pdf_edge_ra_mis_lifestyle" },
        { value: "attraction", label: "Attraction", edgeId: "pdf_edge_ra_mis_attraction" },
        { value: "communication", label: "Communication", edgeId: "pdf_edge_ra_mis_comm" },
        { value: "values", label: "Values", edgeId: "pdf_edge_ra_mis_values" },
        { value: "energy", label: "Energy", edgeId: "pdf_edge_ra_mis_energy" },
        { value: "other", label: "Other", edgeId: "pdf_edge_ra_mis_other" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "pdf_edge_ra_mis_expire",
    },
  },
];

export const edges = [
  // ═══ Phase 1: Pre-check ═══════════════════════════════════════════════════
  { edgeId: "pdf_e_start", source: "pdf_start", target: "pdf_delay_settle" },
  { edgeId: "pdf_e_delay_ask", source: "pdf_delay_settle", target: "pdf_decision_connected" },

  // Connected? → Yes / Not yet
  { edgeId: "pdf_edge_connected_yes", source: "pdf_decision_connected", target: "pdf_decision_did_meet", label: "Yes we connected" },
  { edgeId: "pdf_edge_connected_not_yet", source: "pdf_decision_connected", target: "pdf_msg_not_connected", label: "Not yet" },
  { edgeId: "pdf_edge_connected_timeout", source: "pdf_decision_connected", target: "pdf_msg_reminder_1", label: "No response (24h)" },

  // Not connected → wait 3 days → re-ask
  { edgeId: "pdf_e_not_conn_delay", source: "pdf_msg_not_connected", target: "pdf_delay_reconnect" },
  { edgeId: "pdf_e_delay_reconnect", source: "pdf_delay_reconnect", target: "pdf_decision_reconnect" },
  { edgeId: "pdf_edge_reconnect_yes", source: "pdf_decision_reconnect", target: "pdf_decision_did_meet", label: "Yes" },
  { edgeId: "pdf_edge_reconnect_not_yet", source: "pdf_decision_reconnect", target: "pdf_msg_close_no_connect", label: "Not yet" },
  { edgeId: "pdf_edge_reconnect_timeout", source: "pdf_decision_reconnect", target: "pdf_msg_close_no_connect", label: "No response" },

  // Close — no connect
  { edgeId: "pdf_e_close_no_conn", source: "pdf_msg_close_no_connect", target: "pdf_action_close_no_connect" },
  { edgeId: "pdf_e_close_no_conn_end", source: "pdf_action_close_no_connect", target: "pdf_end_no_connect" },

  // Did you meet? → Yes / Not yet
  { edgeId: "pdf_edge_met_yes", source: "pdf_decision_did_meet", target: "pdf_decision_chemistry", label: "Yes" },
  { edgeId: "pdf_edge_met_not_yet", source: "pdf_decision_did_meet", target: "pdf_msg_not_met", label: "Not yet" },
  { edgeId: "pdf_edge_met_timeout", source: "pdf_decision_did_meet", target: "pdf_msg_nudge_met", label: "Timeout" },

  // Not met → wait 3 days → re-ask
  { edgeId: "pdf_e_not_met_delay", source: "pdf_msg_not_met", target: "pdf_delay_recheck_met" },
  { edgeId: "pdf_e_delay_recheck", source: "pdf_delay_recheck_met", target: "pdf_decision_recheck_met" },
  { edgeId: "pdf_edge_recheck_met_yes", source: "pdf_decision_recheck_met", target: "pdf_decision_chemistry", label: "Yes" },
  { edgeId: "pdf_edge_recheck_met_not_yet", source: "pdf_decision_recheck_met", target: "pdf_msg_close_no_meet", label: "Not yet" },
  { edgeId: "pdf_edge_recheck_met_timeout", source: "pdf_decision_recheck_met", target: "pdf_msg_close_no_meet", label: "No response" },

  // Close — no meet
  { edgeId: "pdf_e_close_no_meet", source: "pdf_msg_close_no_meet", target: "pdf_action_close_no_meet" },
  { edgeId: "pdf_e_close_no_meet_end", source: "pdf_action_close_no_meet", target: "pdf_end_no_meet" },

  // ═══ Phase 2: Feedback collection (linear) ════════════════════════════════
  // Chemistry → ALL options go to See Again
  { edgeId: "pdf_edge_chem_great", source: "pdf_decision_chemistry", target: "pdf_decision_see_again", label: "Great" },
  { edgeId: "pdf_edge_chem_good", source: "pdf_decision_chemistry", target: "pdf_decision_see_again", label: "Good" },
  { edgeId: "pdf_edge_chem_neutral", source: "pdf_decision_chemistry", target: "pdf_decision_see_again", label: "Neutral" },
  { edgeId: "pdf_edge_chem_not_match", source: "pdf_decision_chemistry", target: "pdf_decision_see_again", label: "Not a match" },
  { edgeId: "pdf_edge_chem_timeout", source: "pdf_decision_chemistry", target: "pdf_msg_nudge_chem", label: "Timeout" },

  // See Again → ALL options go to Free Text
  { edgeId: "pdf_edge_see_yes", source: "pdf_decision_see_again", target: "pdf_fb_adjust", label: "Yes" },
  { edgeId: "pdf_edge_see_maybe", source: "pdf_decision_see_again", target: "pdf_fb_adjust", label: "Maybe" },
  { edgeId: "pdf_edge_see_no", source: "pdf_decision_see_again", target: "pdf_fb_adjust", label: "No" },
  { edgeId: "pdf_edge_see_timeout", source: "pdf_decision_see_again", target: "pdf_msg_nudge_see", label: "Timeout" },

  // Free Text → Save
  { edgeId: "pdf_e_adjust_save", source: "pdf_fb_adjust", target: "pdf_action_save" },

  // ═══ Phase 3: Route based on chemistry ═════════════════════════════════════
  { edgeId: "pdf_e_save_route", source: "pdf_action_save", target: "pdf_condition_not_match" },

  // Positive/neutral path
  { edgeId: "pdf_edge_route_positive", source: "pdf_condition_not_match", target: "pdf_msg_thanks", label: "Not 'not a match'" },
  { edgeId: "pdf_e_thanks_css", source: "pdf_msg_thanks", target: "pdf_action_css_pos" },
  { edgeId: "pdf_e_css_pos_end", source: "pdf_action_css_pos", target: "pdf_end_pos" },

  // Negative path
  { edgeId: "pdf_edge_route_negative", source: "pdf_condition_not_match", target: "pdf_decision_misaligned", label: "Not a match" },
  // Misaligned → ALL options go to thanks
  { edgeId: "pdf_edge_mis_lifestyle", source: "pdf_decision_misaligned", target: "pdf_msg_thanks_neg", label: "Lifestyle" },
  { edgeId: "pdf_edge_mis_attraction", source: "pdf_decision_misaligned", target: "pdf_msg_thanks_neg", label: "Attraction" },
  { edgeId: "pdf_edge_mis_comm", source: "pdf_decision_misaligned", target: "pdf_msg_thanks_neg", label: "Communication" },
  { edgeId: "pdf_edge_mis_values", source: "pdf_decision_misaligned", target: "pdf_msg_thanks_neg", label: "Values" },
  { edgeId: "pdf_edge_mis_energy", source: "pdf_decision_misaligned", target: "pdf_msg_thanks_neg", label: "Energy" },
  { edgeId: "pdf_edge_mis_other", source: "pdf_decision_misaligned", target: "pdf_msg_thanks_neg", label: "Other" },
  { edgeId: "pdf_edge_mis_timeout", source: "pdf_decision_misaligned", target: "pdf_msg_nudge_mis", label: "Timeout" },
  // Thanks → CSS → check bad dates
  { edgeId: "pdf_e_thanks_neg_css", source: "pdf_msg_thanks_neg", target: "pdf_action_css_neg" },
  { edgeId: "pdf_e_css_neg_check", source: "pdf_action_css_neg", target: "pdf_condition_bad_dates" },
  { edgeId: "pdf_edge_neg_end", source: "pdf_condition_bad_dates", target: "pdf_end_neg", label: "< 2 bad dates" },
  { edgeId: "pdf_edge_recalibrate", source: "pdf_condition_bad_dates", target: "pdf_msg_recalibrate", label: ">= 2 bad dates" },
  { edgeId: "pdf_e_recal_review", source: "pdf_msg_recalibrate", target: "pdf_action_human_review" },
  { edgeId: "pdf_e_review_end", source: "pdf_action_human_review", target: "pdf_end_recalibrate" },

  // ═══ No Response chain ════════════════════════════════════════════════════
  { edgeId: "pdf_e_reminder_reask", source: "pdf_msg_reminder_1", target: "pdf_decision_reask_connected" },
  { edgeId: "pdf_edge_reask_conn_yes", source: "pdf_decision_reask_connected", target: "pdf_decision_did_meet", label: "Yes" },
  { edgeId: "pdf_edge_reask_conn_not_yet", source: "pdf_decision_reask_connected", target: "pdf_msg_not_connected", label: "Not yet" },
  { edgeId: "pdf_edge_reask_conn_timeout", source: "pdf_decision_reask_connected", target: "pdf_msg_close_loop", label: "No response (48h)" },
  { edgeId: "pdf_e_close_action", source: "pdf_msg_close_loop", target: "pdf_action_close_loop" },
  { edgeId: "pdf_e_close_end", source: "pdf_action_close_loop", target: "pdf_end_no_response" },

  // ═══ Nudge → Re-ask → Expire edges ═══════════════════════════════════════

  // Did you meet: nudge → re-ask → expire
  { edgeId: "pdf_e_nudge_met_reask", source: "pdf_msg_nudge_met", target: "pdf_reask_met" },
  { edgeId: "pdf_edge_ra_met_yes", source: "pdf_reask_met", target: "pdf_decision_chemistry", label: "Yes" },
  { edgeId: "pdf_edge_ra_met_not_yet", source: "pdf_reask_met", target: "pdf_msg_close_no_meet", label: "Not yet" },
  { edgeId: "pdf_edge_ra_met_expire", source: "pdf_reask_met", target: "pdf_msg_midflow_expire", label: "Timeout → expire" },

  // Chemistry: nudge → re-ask → expire
  { edgeId: "pdf_e_nudge_chem_reask", source: "pdf_msg_nudge_chem", target: "pdf_reask_chem" },
  { edgeId: "pdf_edge_ra_chem_great", source: "pdf_reask_chem", target: "pdf_decision_see_again", label: "Great" },
  { edgeId: "pdf_edge_ra_chem_good", source: "pdf_reask_chem", target: "pdf_decision_see_again", label: "Good" },
  { edgeId: "pdf_edge_ra_chem_neutral", source: "pdf_reask_chem", target: "pdf_decision_see_again", label: "Neutral" },
  { edgeId: "pdf_edge_ra_chem_not_match", source: "pdf_reask_chem", target: "pdf_decision_see_again", label: "Not a match" },
  { edgeId: "pdf_edge_ra_chem_expire", source: "pdf_reask_chem", target: "pdf_msg_midflow_expire", label: "Timeout → expire" },

  // See again: nudge → re-ask → expire
  { edgeId: "pdf_e_nudge_see_reask", source: "pdf_msg_nudge_see", target: "pdf_reask_see" },
  { edgeId: "pdf_edge_ra_see_yes", source: "pdf_reask_see", target: "pdf_fb_adjust", label: "Yes" },
  { edgeId: "pdf_edge_ra_see_maybe", source: "pdf_reask_see", target: "pdf_fb_adjust", label: "Maybe" },
  { edgeId: "pdf_edge_ra_see_no", source: "pdf_reask_see", target: "pdf_fb_adjust", label: "No" },
  { edgeId: "pdf_edge_ra_see_expire", source: "pdf_reask_see", target: "pdf_msg_midflow_expire", label: "Timeout → expire" },

  // Misaligned: nudge → re-ask → expire
  { edgeId: "pdf_e_nudge_mis_reask", source: "pdf_msg_nudge_mis", target: "pdf_reask_mis" },
  { edgeId: "pdf_edge_ra_mis_lifestyle", source: "pdf_reask_mis", target: "pdf_msg_thanks_neg", label: "Lifestyle" },
  { edgeId: "pdf_edge_ra_mis_attraction", source: "pdf_reask_mis", target: "pdf_msg_thanks_neg", label: "Attraction" },
  { edgeId: "pdf_edge_ra_mis_comm", source: "pdf_reask_mis", target: "pdf_msg_thanks_neg", label: "Communication" },
  { edgeId: "pdf_edge_ra_mis_values", source: "pdf_reask_mis", target: "pdf_msg_thanks_neg", label: "Values" },
  { edgeId: "pdf_edge_ra_mis_energy", source: "pdf_reask_mis", target: "pdf_msg_thanks_neg", label: "Energy" },
  { edgeId: "pdf_edge_ra_mis_other", source: "pdf_reask_mis", target: "pdf_msg_thanks_neg", label: "Other" },
  { edgeId: "pdf_edge_ra_mis_expire", source: "pdf_reask_mis", target: "pdf_msg_midflow_expire", label: "Timeout → expire" },

  // Mid-flow expire → close loop
  { edgeId: "pdf_e_midflow_expire_close", source: "pdf_msg_midflow_expire", target: "pdf_action_close_loop" },
];
