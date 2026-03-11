// @ts-nocheck
/**
 * Match Introduction Flow — Convex Schema Format
 *
 * This is the canonical flow from the WhatsApp Matchmaking Flow Specification.
 * Converted from src/components/flows/default-flow-data.ts (ReactFlow format)
 * into the Convex flowDefinitions schema format.
 *
 * Covers: §2 Initial Message, §3 Flow A (Interested — placeholder),
 * §4 Flow B (Not Interested — full feedback loop), §5 Flow C (Upsell),
 * §6 Flow D (No Response — placeholder).
 */

export const FLOW_NAME = "Match Introduction Flow";
export const FLOW_TYPE = "match_feedback";
export const FLOW_DESCRIPTION =
  "WhatsApp Matchmaking Follow-Up Agent — triggered when a new match is assigned. " +
  "Sends profile link, collects structured feedback through 4 response flows: " +
  "Interested (placeholder), Not Interested (full feedback loop), Upsell, No Response (placeholder).";

export const nodes = [
  // §2 — TRIGGER + INITIAL MESSAGE + DECISION (combined into one interactive message)
  {
    nodeId: "start_1",
    type: "start",
    label: "New Match Assigned",
    position: { x: 2000, y: 0 },
    config: { triggerType: "webhook" },
  },
  // §2 — Intro text + 3 buttons as one WhatsApp interactive message
  // No separate MESSAGE node — the DECISION body IS the intro text with buttons attached
  {
    nodeId: "decision_response",
    type: "decision",
    label: "Member Response",
    position: { x: 2000, y: 500 },
    config: {
      question:
        "Hi {{memberFirstName}}!\n\nI'm Matcha, reaching out on behalf of Club Allenby.\n\nWe've found a new match for you - Its waiting for you in your email! 🎉\n\nHere is a link to their profile: {{profileLink}}\n\nOnce you've reviewed, let us know — what's your take?",
      options: [
        { value: "interested", label: "I'm interested", edgeId: "edge_interested" },
        { value: "not_interested", label: "Not interested", edgeId: "edge_not_interested" },
        { value: "upsell_intro", label: "More info / intro", edgeId: "edge_upsell_intro" },
      ],
      // No Response: 2-day timeout starts the structured follow-up sequence (Day 2/5/7/8)
      timeout: 172800000, // 2 days
      timeoutEdgeId: "edge_timeout_day2",
      templateKey: "MATCH_INTRO",
    },
  },

  // §3 — FLOW A: MEMBER IS INTERESTED
  {
    nodeId: "decision_interested_outreach",
    type: "decision",
    label: "Outreach Decision",
    position: { x: 500, y: 1700 },
    config: {
      question:
        "Great — glad you're interested. Before making the introduction, we typically connect with them directly to learn a bit more and present you intentionally.\n\nWould you like us to initiate that outreach on your behalf?",
      options: [
        { value: "interested_yes", label: "Yes, start outreach", edgeId: "edge_interested_yes" },
        { value: "interested_pass", label: "Actually I'll pass", edgeId: "edge_interested_pass" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_nudge_interested_outreach",
    },
  },
  {
    nodeId: "msg_interested_prepayment",
    type: "message",
    label: "Pre-Payment — Interested",
    position: { x: 500, y: 2200 },
    config: {
      template:
        "Perfect — I can do that. I'll reach out to them directly, share a bit about you, and gauge their interest before making a formal introduction.\n\nIt's $250 total, split into two parts — $125 now to initiate the outreach, and $125 only if they're interested in connecting. You can activate it here:",
      channel: "whatsapp",
    },
  },

  // §4 — FLOW B: NOT INTERESTED
  // §4.1 — Primary reason selection (8 options → list-picker)
  {
    nodeId: "decision_why_not",
    type: "decision",
    label: "Why Not Interested?",
    position: { x: 2000, y: 1200 },
    config: {
      question:
        "Totally understand. To help us refine your future matches, would you mind sharing what didn't feel right?",
      options: [
        { value: "physical", label: "Physical attraction", edgeId: "edge_physical" },
        { value: "bio", label: "Bio didn't resonate", edgeId: "edge_bio" },
        { value: "career", label: "Career ambitions mismatch", edgeId: "edge_career" },
        { value: "religious", label: "Religious level mismatch", edgeId: "edge_religious" },
        { value: "age", label: "Age preference", edgeId: "edge_age" },
        { value: "location", label: "Location", edgeId: "edge_location" },
        { value: "gut_feeling", label: "Can't explain it", edgeId: "edge_gut_feeling" },
        { value: "other", label: "Something else", edgeId: "edge_other" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_nudge_why_not",
    },
  },

  // §4.2 — Sub-category feedback nodes
  {
    nodeId: "fb_physical",
    type: "feedback_collect",
    label: "Physical Attraction",
    position: { x: -400, y: 2000 },
    config: {
      feedbackType: "physical",
      prompt: "Is this person outside your physical type?",
      categories: ["Yes", "Somewhat", "No"],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_bio",
    type: "feedback_collect",
    label: "Bio Didn't Resonate",
    position: { x: 100, y: 2000 },
    config: {
      feedbackType: "bio",
      prompt: "Based on what you read, what felt misaligned?",
      categories: ["Values didn't feel aligned", "Didn't feel depth", "Hard to picture compatibility from the bio"],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_career",
    type: "feedback_collect",
    label: "Career Mismatch",
    position: { x: 600, y: 2000 },
    config: {
      feedbackType: "career",
      prompt: "Based on the career description, what felt off?",
      categories: [
        "Not ambitious enough for me",
        "Too career-focused",
        "Income level mismatch",
        "Industry doesn't align with my lifestyle",
        "Work-life balance concerns",
      ],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_religious",
    type: "feedback_collect",
    label: "Religious Mismatch",
    position: { x: 1100, y: 2000 },
    config: {
      feedbackType: "religious",
      prompt: "Based on how they describe their observance, what felt off?",
      categories: [
        "More observant than I'm comfortable with",
        "Less observant than I prefer",
        "Practice style felt different than mine",
      ],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_age",
    type: "feedback_collect",
    label: "Age / Life Stage",
    position: { x: 1600, y: 2000 },
    config: {
      feedbackType: "age",
      prompt: "What felt misaligned about that life stage?",
      categories: [
        "I want someone more established",
        "I want someone more flexible / early stage",
        "Marriage timeline mismatch",
        "Kids timeline mismatch",
        "Different maturity levels",
        "Divorce / prior marriage hesitation",
      ],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_location",
    type: "feedback_collect",
    label: "Location",
    position: { x: 2100, y: 2000 },
    config: {
      feedbackType: "location",
      prompt: "Based on location, what felt misaligned?",
      categories: [
        "Too far for me right now",
        "I'm only open to same-city matches",
        "I'm open to distance, but not that city",
        "I don't want to relocate",
        "I want to relocate, but only for the right fit",
      ],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_gut_feeling",
    type: "feedback_collect",
    label: "Can't Explain It",
    position: { x: 2600, y: 2000 },
    config: {
      feedbackType: "gut_feeling",
      prompt: "If you had to categorize it, what was it more?",
      categories: [
        "Physical hesitation",
        "Lifestyle hesitation",
        "Long-term compatibility hesitation",
        "Energy / tone hesitation",
        "Just no initial excitement",
      ],
      allowFreeText: false,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },
  {
    nodeId: "fb_other",
    type: "feedback_collect",
    label: "Something Else (Free Text)",
    position: { x: 3100, y: 2000 },
    config: {
      feedbackType: "other",
      prompt: "No problem — feel free to type it out or send a voice note, and we'll take it from here.",
      categories: [],
      allowFreeText: true,
      timeout: 86400000, // 24h
      timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
    },
  },

  // §4.3 — "Anything else?" loop
  {
    nodeId: "decision_more_reasons",
    type: "decision",
    label: "Anything Else?",
    position: { x: 2000, y: 2800 },
    config: {
      question: "Got it, thank you. Is there anything else that didn't feel right?",
      options: [
        { value: "more_reasons_yes", label: "Yes", edgeId: "edge_more_yes" },
        { value: "more_reasons_no", label: "No", edgeId: "edge_more_no" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_nudge_more_reasons",
    },
  },

  // §4.4 — Closing + system actions
  {
    nodeId: "msg_closing",
    type: "message",
    label: "Closing — Thanks",
    position: { x: 2000, y: 3500 },
    config: {
      template:
        "Thanks for sharing — this really helps us dial in your matches. We'll use this to refine who we send your way next. Talk soon!",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "action_reject",
    type: "action",
    label: "Reject + Write Notes",
    position: { x: 2000, y: 4100 },
    config: {
      actionType: "sync_to_sma",
      params: {
        final_status: "rejected",
      },
    },
  },
  {
    nodeId: "end_rejected",
    type: "end",
    label: "End (Rejected)",
    position: { x: 1500, y: 4900 },
    config: { endType: "completed" },
  },

  // §5 — FLOW C: UPSELL
  {
    nodeId: "decision_upsell",
    type: "decision",
    label: "Upsell: Curated Outreach",
    position: { x: 4500, y: 1200 },
    config: {
      question:
        "At this stage, what you've received is the full profile we're able to share.\n\nIf you'd like to go deeper, we offer a Curated Outreach service — we personally reach out to this person on your behalf, share a bit about you, and gauge their interest before making a formal introduction.\n\nHow it works:\n- Total cost: $250\n- $125 upfront to initiate outreach\n- $125 only if the other party is interested in connecting\n\nNo guarantees — but we present you intentionally and always do our best. Would you like to activate this?",
      options: [
        { value: "upsell_yes", label: "Yes, start outreach", edgeId: "edge_upsell_yes" },
        { value: "upsell_no", label: "No thanks, I'll pass", edgeId: "edge_upsell_no" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_nudge_upsell",
    },
  },
  // §5.2 — Pre-payment message
  {
    nodeId: "msg_upsell_initiate",
    type: "message",
    label: "Initiate Outreach",
    position: { x: 4200, y: 1700 },
    config: {
      template:
        "I'll reach out to them directly on your behalf, share a bit about you, and gauge their interest before any formal introduction is made. I'll keep you updated as soon as I hear back.\n\nIf there's anything specific you'd like us to ask or emphasize about you, feel free to send it now.",
      channel: "whatsapp",
    },
  },
  // §5.2 — Upsell Accepted → Create Stripe checkout + send link via WhatsApp
  {
    nodeId: "action_create_payment",
    type: "action",
    label: "Create Payment Link",
    position: { x: 4200, y: 2200 },
    config: {
      actionType: "create_stripe_link",
      params: {
        amount: 12500, // $125 in cents
        phase: "initial",
      },
    },
  },
  // §5.2 — Post-payment confirmation message
  {
    nodeId: "msg_payment_confirmed",
    type: "message",
    label: "Payment Confirmed",
    position: { x: 4200, y: 2600 },
    config: {
      template:
        "Payment received — we'll initiate outreach shortly. Our team will review the match and reach out directly to learn more and present you intentionally. We'll update you as soon as we have an answer.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "end_upsell_yes",
    type: "end",
    label: "End (Human Touchpoint — Outreach)",
    position: { x: 4200, y: 3200 },
    config: { endType: "completed" },
  },
  {
    nodeId: "msg_upsell_pass",
    type: "message",
    label: "Pass Closing",
    position: { x: 5600, y: 2700 },
    config: {
      template:
        "No problem. We'll move {{matchFirstName}} to your Past Introductions for now.\n\nIf something shifts or you'd like us to reach out later, just ping us with their name and we'll take care of it.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "action_upsell_pass",
    type: "action",
    label: "Move to Past Introductions",
    position: { x: 5600, y: 3300 },
    config: {
      actionType: "update_match_status",
      params: {
        final_status: "past",
        response_type: "upsell_no_pass",
        upsell_offered: true,
        upsell_accepted: false,
        note: "Member declined upsell and passed on the match. Moved from Active → Past Introductions.",
      },
    },
  },
  {
    nodeId: "end_upsell_pass",
    type: "end",
    label: "End (Past Introductions)",
    position: { x: 5600, y: 3900 },
    config: { endType: "completed" },
  },

  // ── Decision Nudge Nodes ─────────────────────────────────────────────────
  // Sent after 24h timeout on each decision node, then loop back to re-ask.
  {
    nodeId: "msg_nudge_why_not",
    type: "message",
    label: "Nudge — Why Not?",
    position: { x: 2700, y: 1200 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in — take your time, but we'd love to hear your thoughts when you're ready.",
      channel: "whatsapp",
      templateKey: "MATCH_NUDGE",
    },
  },
  {
    nodeId: "msg_nudge_more_reasons",
    type: "message",
    label: "Nudge — More Reasons?",
    position: { x: 2700, y: 2800 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in — no rush!",
      channel: "whatsapp",
      templateKey: "MATCH_NUDGE",
    },
  },
  {
    nodeId: "msg_nudge_upsell",
    type: "message",
    label: "Nudge — Upsell",
    position: { x: 5200, y: 1200 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in — take your time with this, no pressure at all.",
      channel: "whatsapp",
      templateKey: "MATCH_NUDGE",
    },
  },
  {
    nodeId: "msg_nudge_interested_outreach",
    type: "message",
    label: "Nudge — Interested Outreach",
    position: { x: 200, y: 1700 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in — take your time, no pressure at all.",
      channel: "whatsapp",
      templateKey: "MATCH_NUDGE",
    },
  },
  // ── Re-Ask Decision Nodes ─────────────────────────────────────────────────
  // After nudge with no response, re-ask the same question one more time.
  // If still no response after timeout, expire the match.
  {
    nodeId: "decision_reask_why_not",
    type: "decision",
    label: "Re-Ask: Why Not Interested?",
    position: { x: 3400, y: 1200 },
    config: {
      question:
        "Totally understand. To help us refine your future matches, would you mind sharing what didn't feel right?",
      options: [
        { value: "physical", label: "Physical attraction", edgeId: "edge_reask_physical" },
        { value: "bio", label: "Bio didn't resonate", edgeId: "edge_reask_bio" },
        { value: "career", label: "Career ambitions mismatch", edgeId: "edge_reask_career" },
        { value: "religious", label: "Religious level mismatch", edgeId: "edge_reask_religious" },
        { value: "age", label: "Age preference", edgeId: "edge_reask_age" },
        { value: "location", label: "Location", edgeId: "edge_reask_location" },
        { value: "gut_feeling", label: "Can't explain it", edgeId: "edge_reask_gut_feeling" },
        { value: "other", label: "Something else", edgeId: "edge_reask_other" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_reask_why_not_expire",
    },
  },
  {
    nodeId: "decision_reask_more_reasons",
    type: "decision",
    label: "Re-Ask: Anything Else?",
    position: { x: 3400, y: 2800 },
    config: {
      question: "Got it, thank you. Is there anything else that didn't feel right?",
      options: [
        { value: "more_reasons_yes", label: "Yes", edgeId: "edge_reask_more_yes" },
        { value: "more_reasons_no", label: "No", edgeId: "edge_reask_more_no" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_reask_more_reasons_expire",
    },
  },
  {
    nodeId: "decision_reask_upsell",
    type: "decision",
    label: "Re-Ask: Curated Outreach",
    position: { x: 5900, y: 1200 },
    config: {
      question:
        "At this stage, what you've received is the full profile we're able to share.\n\nIf you'd like to go deeper, we offer a Curated Outreach service — we personally reach out to this person on your behalf, share a bit about you, and gauge their interest before making a formal introduction.\n\nHow it works:\n- Total cost: $250\n- $125 upfront to initiate outreach\n- $125 only if the other party is interested in connecting\n\nNo guarantees — but we present you intentionally and always do our best. Would you like to activate this?",
      options: [
        { value: "upsell_yes", label: "Yes, start outreach", edgeId: "edge_reask_upsell_yes" },
        { value: "upsell_no", label: "No thanks, I'll pass", edgeId: "edge_reask_upsell_no" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_reask_upsell_expire",
    },
  },
  {
    nodeId: "decision_reask_interested_outreach",
    type: "decision",
    label: "Re-Ask: Outreach Decision",
    position: { x: -100, y: 1700 },
    config: {
      question:
        "Great — glad you're interested. Before making the introduction, we typically connect with them directly to learn a bit more and present you intentionally.\n\nWould you like us to initiate that outreach on your behalf?",
      options: [
        { value: "interested_yes", label: "Yes, start outreach", edgeId: "edge_reask_interested_yes" },
        { value: "interested_pass", label: "Actually I'll pass", edgeId: "edge_reask_interested_pass" },
      ],
      timeout: 86400000, // 24h
      timeoutEdgeId: "edge_reask_interested_outreach_expire",
    },
  },

  // ── Mid-Flow Expire Message ───────────────────────────────────────────────
  {
    nodeId: "msg_midflow_expire",
    type: "message",
    label: "Mid-Flow Expire",
    position: { x: 3400, y: 3400 },
    config: {
      template:
        "No worries — since I haven't heard back, I'll close this out for now and move {{matchFirstName}} to Past Introductions. If anything changes, just message me and we can pick back up.",
      channel: "whatsapp",
      templateKey: "MIDFLOW_EXPIRED",
    },
  },

  {
    nodeId: "action_notify_admin_outreach",
    type: "action",
    label: "Notify Admin — Outreach",
    position: { x: 4200, y: 3000 },
    config: {
      actionType: "notify_admin",
      params: {
        notification:
          "Curated Outreach Requested — Member: {{memberFirstName}} {{memberLastName}}, Target Match: {{matchFirstName}} {{matchLastName}}, Payment: $125 received, Action Required: Schedule outreach call",
      },
    },
  },

  // §6 — FLOW D: STRUCTURED FOLLOW-UP SEQUENCE (Day 2 → 5 → 7 → 8 expire)
  {
    nodeId: "decision_response_day2",
    type: "decision",
    label: "Response (Day 2)",
    position: { x: -800, y: 1200 },
    config: {
      question:
        "Just checking in on the introduction I sent over for {{matchFirstName}}. Introductions remain open for 7 days, so when you have a moment let me know if you're interested or not.",
      options: [
        { value: "interested", label: "I'm interested", edgeId: "edge_day2_interested" },
        { value: "not_interested", label: "Not interested", edgeId: "edge_day2_not_interested" },
        { value: "upsell_intro", label: "More info / intro", edgeId: "edge_day2_upsell" },
      ],
      timeout: 259200000, // 3 days
      timeoutEdgeId: "edge_timeout_day5",
      templateKey: "FOLLOWUP_DAY2",
    },
  },
  {
    nodeId: "decision_response_day5",
    type: "decision",
    label: "Response (Day 5)",
    position: { x: -800, y: 2200 },
    config: {
      question:
        "Circling back on {{matchFirstName}}. This introduction will expire in a couple of days, so let me know if you'd like to proceed or pass before it closes.",
      options: [
        { value: "interested", label: "I'm interested", edgeId: "edge_day5_interested" },
        { value: "not_interested", label: "Not interested", edgeId: "edge_day5_not_interested" },
        { value: "upsell_intro", label: "More info / intro", edgeId: "edge_day5_upsell" },
      ],
      timeout: 172800000, // 2 days
      timeoutEdgeId: "edge_timeout_day7",
      templateKey: "FOLLOWUP_DAY5",
    },
  },
  {
    nodeId: "decision_response_day7",
    type: "decision",
    label: "Response (Day 7)",
    position: { x: -800, y: 3200 },
    config: {
      question:
        "Quick final check on {{matchFirstName}}. Since introductions remain open for 7 days, I'll be moving this match to Past Introductions today if I don't hear back. Just let me know if you'd like to move forward before it expires.",
      options: [
        { value: "interested", label: "I'm interested", edgeId: "edge_day7_interested" },
        { value: "not_interested", label: "Not interested", edgeId: "edge_day7_not_interested" },
        { value: "upsell_intro", label: "More info / intro", edgeId: "edge_day7_upsell" },
      ],
      timeout: 86400000, // 1 day
      timeoutEdgeId: "edge_timeout_day8",
      templateKey: "FOLLOWUP_DAY7",
    },
  },
  {
    nodeId: "msg_expire_day8",
    type: "message",
    label: "Expired — Day 8",
    position: { x: -800, y: 3800 },
    config: {
      template:
        "Since I didn't hear back, I've moved {{matchFirstName}} to Past Introductions to keep your queue clear. If you change your mind later, just message me their name and we can reopen it.",
      channel: "whatsapp",
      templateKey: "FOLLOWUP_EXPIRED",
    },
  },
  {
    nodeId: "action_expire",
    type: "action",
    label: "Expire + Past Intro",
    position: { x: -800, y: 4200 },
    config: {
      actionType: "update_match_status",
      params: {
        final_status: "past",
        response_type: "no_response",
        note: "No response after 8-day follow-up sequence. Moved to Past Introductions.",
      },
    },
  },
  {
    nodeId: "end_expired",
    type: "end",
    label: "End (Expired)",
    position: { x: -800, y: 4600 },
    config: { endType: "expired" },
  },

  // §4.4b — 3-DECLINE RECALIBRATION
  {
    nodeId: "condition_check_declines",
    type: "condition",
    label: "Check Decline Count",
    position: { x: 2000, y: 4500 },
    config: {
      expression: "rejectionCount >= 3",
      trueEdgeId: "e_decline_recalibrate",
      falseEdgeId: "e_decline_ok",
    },
  },
  {
    nodeId: "msg_recalibration",
    type: "message",
    label: "Recalibration Offer",
    position: { x: 2500, y: 4900 },
    config: {
      template:
        "I want to pause before sending another profile. After a few declines, it's usually helpful to recalibrate together so we don't keep missing.\n\nPlease book a quick alignment call here: {{recalibrationLink}}\n\nWe'll refine and move forward intentionally.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "action_recalibration",
    type: "action",
    label: "Set Recalibrating",
    position: { x: 2500, y: 5400 },
    config: {
      actionType: "schedule_recalibration",
      params: {},
    },
  },
  {
    nodeId: "end_recalibration",
    type: "end",
    label: "End (Recalibration)",
    position: { x: 2500, y: 5800 },
    config: { endType: "completed" },
  },
];

export const edges = [
  // §2 Start → Decision (intro + buttons combined in one message)
  { edgeId: "e_start_decision", source: "start_1", target: "decision_response" },

  // §2 Member Response → 3 flows + timeout
  { edgeId: "edge_interested", source: "decision_response", target: "decision_interested_outreach", label: "I'm interested" },
  { edgeId: "edge_not_interested", source: "decision_response", target: "decision_why_not", label: "Not interested" },
  { edgeId: "edge_upsell_intro", source: "decision_response", target: "decision_upsell", label: "More info / intro" },

  // §3 Interested → Decision → Payment (or Pass)
  { edgeId: "edge_interested_yes", source: "decision_interested_outreach", target: "msg_interested_prepayment", label: "Yes, start outreach" },
  { edgeId: "edge_interested_pass", source: "decision_interested_outreach", target: "msg_upsell_pass", label: "Actually I'll pass" },
  { edgeId: "e_interested_prepay_action", source: "msg_interested_prepayment", target: "action_create_payment" },

  // §6 Structured follow-up chain (Day 2 → 5 → 7 → 8 expire)
  { edgeId: "edge_timeout_day2", source: "decision_response", target: "decision_response_day2", label: "No response (Day 2)" },
  { edgeId: "edge_day2_interested", source: "decision_response_day2", target: "decision_interested_outreach", label: "I'm interested" },
  { edgeId: "edge_day2_not_interested", source: "decision_response_day2", target: "decision_why_not", label: "Not interested" },
  { edgeId: "edge_day2_upsell", source: "decision_response_day2", target: "decision_upsell", label: "More info / intro" },
  { edgeId: "edge_timeout_day5", source: "decision_response_day2", target: "decision_response_day5", label: "No response (Day 5)" },
  { edgeId: "edge_day5_interested", source: "decision_response_day5", target: "decision_interested_outreach", label: "I'm interested" },
  { edgeId: "edge_day5_not_interested", source: "decision_response_day5", target: "decision_why_not", label: "Not interested" },
  { edgeId: "edge_day5_upsell", source: "decision_response_day5", target: "decision_upsell", label: "More info / intro" },
  { edgeId: "edge_timeout_day7", source: "decision_response_day5", target: "decision_response_day7", label: "No response (Day 7)" },
  { edgeId: "edge_day7_interested", source: "decision_response_day7", target: "decision_interested_outreach", label: "I'm interested" },
  { edgeId: "edge_day7_not_interested", source: "decision_response_day7", target: "decision_why_not", label: "Not interested" },
  { edgeId: "edge_day7_upsell", source: "decision_response_day7", target: "decision_upsell", label: "More info / intro" },
  { edgeId: "edge_timeout_day8", source: "decision_response_day7", target: "msg_expire_day8", label: "No response (Day 8)" },
  { edgeId: "e_expire_action", source: "msg_expire_day8", target: "action_expire" },
  { edgeId: "e_expire_end", source: "action_expire", target: "end_expired" },

  // §4.1 Why Not → 8 feedback nodes
  { edgeId: "edge_physical", source: "decision_why_not", target: "fb_physical", label: "Physical" },
  { edgeId: "edge_bio", source: "decision_why_not", target: "fb_bio", label: "Bio" },
  { edgeId: "edge_career", source: "decision_why_not", target: "fb_career", label: "Career" },
  { edgeId: "edge_religious", source: "decision_why_not", target: "fb_religious", label: "Religious" },
  { edgeId: "edge_age", source: "decision_why_not", target: "fb_age", label: "Age" },
  { edgeId: "edge_location", source: "decision_why_not", target: "fb_location", label: "Location" },
  { edgeId: "edge_gut_feeling", source: "decision_why_not", target: "fb_gut_feeling", label: "Gut feeling" },
  { edgeId: "edge_other", source: "decision_why_not", target: "fb_other", label: "Other" },

  // §4.3 Seven sub-categories → "Anything else?" loop
  { edgeId: "e_fb_physical_loop", source: "fb_physical", target: "decision_more_reasons" },
  { edgeId: "e_fb_bio_loop", source: "fb_bio", target: "decision_more_reasons" },
  { edgeId: "e_fb_career_loop", source: "fb_career", target: "decision_more_reasons" },
  { edgeId: "e_fb_religious_loop", source: "fb_religious", target: "decision_more_reasons" },
  { edgeId: "e_fb_age_loop", source: "fb_age", target: "decision_more_reasons" },
  { edgeId: "e_fb_location_loop", source: "fb_location", target: "decision_more_reasons" },
  { edgeId: "e_fb_gut_feeling_loop", source: "fb_gut_feeling", target: "decision_more_reasons" },

  // "Something else" → direct to closing (skips loop per spec)
  { edgeId: "e_fb_other_closing", source: "fb_other", target: "msg_closing" },

  // §4.3 "Anything else?" → Yes (loop) / No (closing)
  { edgeId: "edge_more_yes", source: "decision_more_reasons", target: "decision_why_not", label: "Yes" },
  { edgeId: "edge_more_no", source: "decision_more_reasons", target: "msg_closing", label: "No" },

  // §4.4 Closing → Reject → Check Declines → End or Recalibrate
  { edgeId: "e_closing_reject", source: "msg_closing", target: "action_reject" },
  { edgeId: "e_reject_check", source: "action_reject", target: "condition_check_declines" },
  { edgeId: "e_decline_ok", source: "condition_check_declines", target: "end_rejected", label: "< 3 declines" },
  { edgeId: "e_decline_recalibrate", source: "condition_check_declines", target: "msg_recalibration", label: "≥ 3 declines" },
  { edgeId: "e_recalibration_action", source: "msg_recalibration", target: "action_recalibration" },
  { edgeId: "e_recalibration_end", source: "action_recalibration", target: "end_recalibration" },

  // §5.1 Upsell → Yes / No
  { edgeId: "edge_upsell_yes", source: "decision_upsell", target: "msg_upsell_initiate", label: "Yes, activate" },
  { edgeId: "e_initiate_payment", source: "msg_upsell_initiate", target: "action_create_payment" },
  { edgeId: "edge_upsell_no", source: "decision_upsell", target: "msg_upsell_pass", label: "No thanks, I'll pass" },

  // §5.2 Upsell Yes → Payment → Confirmation → Admin Notify → End
  { edgeId: "e_payment_confirmed", source: "action_create_payment", target: "msg_payment_confirmed" },
  { edgeId: "e_payment_to_notify", source: "msg_payment_confirmed", target: "action_notify_admin_outreach" },
  { edgeId: "e_notify_to_end", source: "action_notify_admin_outreach", target: "end_upsell_yes" },

  // §5.3.2 Pass → Action → End
  { edgeId: "e_upsell_pass_action", source: "msg_upsell_pass", target: "action_upsell_pass" },
  { edgeId: "e_upsell_pass_end", source: "action_upsell_pass", target: "end_upsell_pass" },

  // Decision nudge timeout edges (timeout → nudge → loop back)
  { edgeId: "edge_nudge_why_not", source: "decision_why_not", target: "msg_nudge_why_not", label: "Timeout nudge" },
  { edgeId: "e_nudge_why_not_loop", source: "msg_nudge_why_not", target: "decision_reask_why_not" },
  { edgeId: "edge_nudge_more_reasons", source: "decision_more_reasons", target: "msg_nudge_more_reasons", label: "Timeout nudge" },
  { edgeId: "e_nudge_more_reasons_loop", source: "msg_nudge_more_reasons", target: "decision_reask_more_reasons" },
  { edgeId: "edge_nudge_upsell", source: "decision_upsell", target: "msg_nudge_upsell", label: "Timeout nudge" },
  { edgeId: "e_nudge_upsell_loop", source: "msg_nudge_upsell", target: "decision_reask_upsell" },
  { edgeId: "edge_nudge_interested_outreach", source: "decision_interested_outreach", target: "msg_nudge_interested_outreach", label: "Timeout nudge" },
  { edgeId: "e_nudge_interested_outreach_loop", source: "msg_nudge_interested_outreach", target: "decision_reask_interested_outreach" },

  // ── Re-ask Decision → Option Edges ──────────────────────────────────────
  // (member clicks a button on the re-asked question after nudge)

  // decision_reask_why_not → same 8 feedback nodes
  { edgeId: "edge_reask_physical", source: "decision_reask_why_not", target: "fb_physical", label: "Physical" },
  { edgeId: "edge_reask_bio", source: "decision_reask_why_not", target: "fb_bio", label: "Bio" },
  { edgeId: "edge_reask_career", source: "decision_reask_why_not", target: "fb_career", label: "Career" },
  { edgeId: "edge_reask_religious", source: "decision_reask_why_not", target: "fb_religious", label: "Religious" },
  { edgeId: "edge_reask_age", source: "decision_reask_why_not", target: "fb_age", label: "Age" },
  { edgeId: "edge_reask_location", source: "decision_reask_why_not", target: "fb_location", label: "Location" },
  { edgeId: "edge_reask_gut_feeling", source: "decision_reask_why_not", target: "fb_gut_feeling", label: "Gut feeling" },
  { edgeId: "edge_reask_other", source: "decision_reask_why_not", target: "fb_other", label: "Other" },

  // decision_reask_more_reasons → Yes (back to original why_not) / No (closing)
  { edgeId: "edge_reask_more_yes", source: "decision_reask_more_reasons", target: "decision_why_not", label: "Yes" },
  { edgeId: "edge_reask_more_no", source: "decision_reask_more_reasons", target: "msg_closing", label: "No" },

  // decision_reask_upsell → Yes (initiate) / No (pass)
  { edgeId: "edge_reask_upsell_yes", source: "decision_reask_upsell", target: "msg_upsell_initiate", label: "Yes, activate" },
  { edgeId: "edge_reask_upsell_no", source: "decision_reask_upsell", target: "msg_upsell_pass", label: "No thanks, I'll pass" },

  // decision_reask_interested_outreach → Yes (prepayment) / No (pass)
  { edgeId: "edge_reask_interested_yes", source: "decision_reask_interested_outreach", target: "msg_interested_prepayment", label: "Yes, start outreach" },
  { edgeId: "edge_reask_interested_pass", source: "decision_reask_interested_outreach", target: "msg_upsell_pass", label: "Actually I'll pass" },

  // ── Re-ask Timeout → Mid-Flow Expire ────────────────────────────────────
  { edgeId: "edge_reask_why_not_expire", source: "decision_reask_why_not", target: "msg_midflow_expire", label: "Timeout → expire" },
  { edgeId: "edge_reask_more_reasons_expire", source: "decision_reask_more_reasons", target: "msg_midflow_expire", label: "Timeout → expire" },
  { edgeId: "edge_reask_upsell_expire", source: "decision_reask_upsell", target: "msg_midflow_expire", label: "Timeout → expire" },
  { edgeId: "edge_reask_interested_outreach_expire", source: "decision_reask_interested_outreach", target: "msg_midflow_expire", label: "Timeout → expire" },

  // Mid-flow expire → reuse existing expire action + end
  { edgeId: "e_midflow_expire_action", source: "msg_midflow_expire", target: "action_expire" },
];
