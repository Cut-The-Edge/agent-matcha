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
export const FLOW_TYPE = "match_introduction";
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
        { value: "upsell_intro", label: "I want more info / an intro", edgeId: "edge_upsell_intro" },
      ],
      // No Response is handled by a 24h background timeout, not a user button
      timeout: 86400000, // 24 hours
      timeoutEdgeId: "edge_no_resp",
    },
  },

  // §3 — FLOW A: INTERESTED (PLACEHOLDER)
  {
    nodeId: "action_interested",
    type: "action",
    label: "Flow A: Interested (TBD)",
    position: { x: 500, y: 1200 },
    config: {
      actionType: "update_match_status",
      params: {
        final_status: "active",
        response_type: "interested",
        note: "Member is interested. PLACEHOLDER — Full interested flow TBD.",
      },
    },
  },
  {
    nodeId: "end_interested",
    type: "end",
    label: "End (Placeholder)",
    position: { x: 500, y: 1700 },
    config: { endType: "completed" },
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
      timeout: 86400000,
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
        actions: [
          "Move match: Active Introductions → Rejected Introductions",
          "Write all collected reasons + sub-selections to Match Notes",
        ],
      },
    },
  },
  {
    nodeId: "end_rejected",
    type: "end",
    label: "End (Rejected)",
    position: { x: 2000, y: 4700 },
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
        "Great question! What you received is the full profile we're able to share at this stage.\n\nIf you'd like to go deeper, we can personally reach out to this person on your behalf and represent you. This is an additional concierge service.\n\nHow it works:\n- Total cost: $250\n- $125 upfront to initiate outreach\n- $125 only if the other party agrees to connect\n\nThere are no guarantees — but we always try our best. Would you like to activate this?",
      options: [
        { value: "upsell_yes", label: "Yes, activate", edgeId: "edge_upsell_yes" },
        { value: "upsell_no", label: "No, I'll pass", edgeId: "edge_upsell_no" },
      ],
      timeout: 86400000,
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
        "Great, I'll initiate the outreach on your behalf! To get started, please complete the first payment below.",
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
        "Payment received — thank you, {{memberFirstName}}! 🎉\n\nWe're now reaching out to your match on your behalf. We'll keep you updated right here on WhatsApp as soon as we hear back.",
      channel: "whatsapp",
    },
  },
  {
    nodeId: "end_upsell_yes",
    type: "end",
    label: "End (Pending — Outreach Initiated)",
    position: { x: 4200, y: 3200 },
    config: { endType: "completed" },
  },
  {
    nodeId: "decision_upsell_followup",
    type: "decision",
    label: "Still Interested?",
    position: { x: 5200, y: 2000 },
    config: {
      question:
        "No problem at all! Based on the profile, are you still interested in this match, or would you like to pass?",
      options: [
        { value: "upsell_pass_interested", label: "I'm interested", edgeId: "edge_upsell_pass_interested" },
        { value: "upsell_pass_not_interested", label: "Not interested", edgeId: "edge_upsell_pass_not_interested" },
      ],
      timeout: 86400000,
      timeoutEdgeId: "edge_nudge_followup",
    },
  },
  {
    nodeId: "msg_upsell_pass",
    type: "message",
    label: "Pass Closing",
    position: { x: 5600, y: 2700 },
    config: {
      template:
        "No problem. If something shifts or you'd like to reach out later, just let us know. We're always here.",
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
    },
  },
  {
    nodeId: "msg_nudge_followup",
    type: "message",
    label: "Nudge — Followup",
    position: { x: 5900, y: 2000 },
    config: {
      template:
        "Hey {{memberFirstName}}, still here whenever you're ready!",
      channel: "whatsapp",
    },
  },

  // §6 — FLOW D: NO RESPONSE — Send a nudge, then re-ask
  {
    nodeId: "msg_no_response_nudge",
    type: "message",
    label: "Nudge — No Response",
    position: { x: -400, y: 1200 },
    config: {
      template:
        "Hey {{memberFirstName}}, just checking in! Did you get a chance to review the profile we sent? We'd love to hear your thoughts whenever you're ready.",
      channel: "whatsapp",
    },
  },
];

export const edges = [
  // §2 Start → Decision (intro + buttons combined in one message)
  { edgeId: "e_start_decision", source: "start_1", target: "decision_response" },

  // §2 Member Response → 3 flows + timeout
  { edgeId: "edge_interested", source: "decision_response", target: "action_interested", label: "I'm interested" },
  { edgeId: "edge_not_interested", source: "decision_response", target: "decision_why_not", label: "Not interested" },
  { edgeId: "edge_upsell_intro", source: "decision_response", target: "decision_upsell", label: "More info / intro" },
  { edgeId: "edge_no_resp", source: "decision_response", target: "msg_no_response_nudge", label: "No response (timeout)" },

  // §3 Interested → End
  { edgeId: "e_interested_end", source: "action_interested", target: "end_interested" },

  // §6 No Response nudge → loop back to decision (re-send the question)
  { edgeId: "e_nudge_loop", source: "msg_no_response_nudge", target: "decision_response" },

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

  // §4.4 Closing → Reject → End
  { edgeId: "e_closing_reject", source: "msg_closing", target: "action_reject" },
  { edgeId: "e_reject_end", source: "action_reject", target: "end_rejected" },

  // §5.1 Upsell → Yes / No
  { edgeId: "edge_upsell_yes", source: "decision_upsell", target: "msg_upsell_initiate", label: "Yes, activate" },
  { edgeId: "e_initiate_payment", source: "msg_upsell_initiate", target: "action_create_payment" },
  { edgeId: "edge_upsell_no", source: "decision_upsell", target: "decision_upsell_followup", label: "No, I'll pass" },

  // §5.2 Upsell Yes → Payment confirmed message → End
  { edgeId: "e_payment_confirmed", source: "action_create_payment", target: "msg_payment_confirmed" },
  { edgeId: "e_upsell_yes_end", source: "msg_payment_confirmed", target: "end_upsell_yes" },

  // §5.3 Still interested?
  { edgeId: "edge_upsell_pass_interested", source: "decision_upsell_followup", target: "action_interested", label: "I'm interested" },
  { edgeId: "edge_upsell_pass_not_interested", source: "decision_upsell_followup", target: "msg_upsell_pass", label: "Not interested" },

  // §5.3.2 Pass → Action → End
  { edgeId: "e_upsell_pass_action", source: "msg_upsell_pass", target: "action_upsell_pass" },
  { edgeId: "e_upsell_pass_end", source: "action_upsell_pass", target: "end_upsell_pass" },

  // Decision nudge timeout edges (timeout → nudge → loop back)
  { edgeId: "edge_nudge_why_not", source: "decision_why_not", target: "msg_nudge_why_not", label: "Timeout nudge" },
  { edgeId: "e_nudge_why_not_loop", source: "msg_nudge_why_not", target: "decision_why_not" },
  { edgeId: "edge_nudge_more_reasons", source: "decision_more_reasons", target: "msg_nudge_more_reasons", label: "Timeout nudge" },
  { edgeId: "e_nudge_more_reasons_loop", source: "msg_nudge_more_reasons", target: "decision_more_reasons" },
  { edgeId: "edge_nudge_upsell", source: "decision_upsell", target: "msg_nudge_upsell", label: "Timeout nudge" },
  { edgeId: "e_nudge_upsell_loop", source: "msg_nudge_upsell", target: "decision_upsell" },
  { edgeId: "edge_nudge_followup", source: "decision_upsell_followup", target: "msg_nudge_followup", label: "Timeout nudge" },
  { edgeId: "e_nudge_followup_loop", source: "msg_nudge_followup", target: "decision_upsell_followup" },
];
