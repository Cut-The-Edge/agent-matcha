/**
 * Default Flow Data — WhatsApp Matchmaking Follow-Up Agent
 *
 * Based on Dani's engineering spec v1.0 (March 3, 2026).
 * Covers the full lifecycle: §2 Initial Message, §3 Flow A (Interested — placeholder),
 * §4 Flow B (Not Interested — full feedback loop), §5 Flow C (Upsell),
 * §6 Flow D (No Response — placeholder).
 *
 * Spec reference: /Users/adialia/Downloads/WhatsApp Matchmaking Flow Specification.md
 */
import type { Node, Edge } from "@xyflow/react"

// ============================================================================
// Nodes (28 total)
// ============================================================================

export const defaultNodes: Node[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // §2 — TRIGGER + INITIAL MESSAGE
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "start_1",
    type: "start",
    position: { x: 2000, y: 0 },
    data: {
      label: "New Match Assigned",
      config: { triggerType: "webhook" },
    },
  },

  // §2 — Intro text + 3 buttons as one WhatsApp interactive message
  // No separate MESSAGE node — the DECISION body IS the intro text with buttons attached
  {
    id: "decision_response",
    type: "decision",
    position: { x: 2000, y: 500 },
    data: {
      label: "Member Response",
      config: {
        question:
          "Hi {{memberFirstName}}!\n\nI'm Matcha, reaching out on behalf of Club Allenby.\n\nWe've found a new match for you - Its waiting for you in your email! 🎉\n\nHere is a link to their profile: {{profileLink}}\n\nOnce you've reviewed, let us know — what's your take?",
        options: [
          {
            value: "interested",
            label: "I'm interested",
            edgeId: "edge_interested",
          },
          {
            value: "not_interested",
            label: "Not interested",
            edgeId: "edge_not_interested",
          },
          {
            value: "upsell_intro",
            label: "I want more info / an intro",
            edgeId: "edge_upsell_intro",
          },
        ],
        // No Response handled by 24h background timeout, NOT a button
        timeout: 86400000, // 24 hours
        timeoutEdgeId: "edge_no_resp",
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §3 — FLOW A: MEMBER IS INTERESTED (PLACEHOLDER)
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "action_interested",
    type: "action",
    position: { x: 500, y: 1200 },
    data: {
      label: "Flow A: Interested (TBD)",
      config: {
        actionType: "update_match_status",
        params: {
          final_status: "active",
          response_type: "interested",
          note: "Member is interested. PLACEHOLDER — Full interested flow TBD.",
        },
      },
    },
  },
  {
    id: "end_interested",
    type: "end",
    position: { x: 500, y: 1700 },
    data: {
      label: "End (Placeholder)",
      config: { endType: "completed" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §4 — FLOW B: MEMBER IS NOT INTERESTED
  // ══════════════════════════════════════════════════════════════════════════

  // §4.1 — Primary reason selection
  {
    id: "decision_why_not",
    type: "decision",
    position: { x: 2000, y: 1200 },
    data: {
      label: "Why Not Interested?",
      config: {
        question:
          "Totally understand. To help us refine your future matches, would you mind sharing what didn't feel right?",
        options: [
          {
            value: "physical",
            label: "Physical attraction",
            edgeId: "edge_physical",
          },
          {
            value: "bio",
            label: "Bio didn't resonate",
            edgeId: "edge_bio",
          },
          {
            value: "career",
            label: "Career ambitions mismatch",
            edgeId: "edge_career",
          },
          {
            value: "religious",
            label: "Religious level mismatch",
            edgeId: "edge_religious",
          },
          {
            value: "age",
            label: "Age preference",
            edgeId: "edge_age",
          },
          {
            value: "location",
            label: "Location",
            edgeId: "edge_location",
          },
          {
            value: "gut_feeling",
            label: "Can't explain it",
            edgeId: "edge_gut_feeling",
          },
          {
            value: "other",
            label: "Something else",
            edgeId: "edge_other",
          },
        ],
        timeout: 86400000,
        timeoutEdgeId: "edge_nudge_why_not",
      },
    },
  },

  // ── §4.2 Sub-category follow-ups (feedback_collect nodes) ──────────────
  // Each collects the secondary question per the spec.
  // 7 of 8 route to the "Anything else?" loop (§4.3).
  // "Something else" (other) routes directly to closing (§4.4).

  // §4.2.1 Physical Attraction
  {
    id: "fb_physical",
    type: "feedback_collect",
    position: { x: -400, y: 2000 },
    data: {
      label: "Physical Attraction",
      config: {
        feedbackType: "physical",
        prompt: "Is this person outside your physical type?",
        categories: [
          "Yes",
          "Somewhat",
          "No",
        ],
        allowFreeText: false,
        timeout: 86400000,
        timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
      },
    },
  },

  // §4.2.2 Bio Didn't Resonate
  {
    id: "fb_bio",
    type: "feedback_collect",
    position: { x: 100, y: 2000 },
    data: {
      label: "Bio Didn't Resonate",
      config: {
        feedbackType: "bio",
        prompt: "Based on what you read, what felt misaligned?",
        categories: [
          "Values didn't feel aligned",
          "Didn't feel depth",
          "Hard to picture compatibility from the bio",
        ],
        allowFreeText: false,
        timeout: 86400000,
        timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
      },
    },
  },

  // §4.2.3 Career Ambitions Mismatch
  {
    id: "fb_career",
    type: "feedback_collect",
    position: { x: 600, y: 2000 },
    data: {
      label: "Career Mismatch",
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
  },

  // §4.2.4 Religious Level Mismatch
  {
    id: "fb_religious",
    type: "feedback_collect",
    position: { x: 1100, y: 2000 },
    data: {
      label: "Religious Mismatch",
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
  },

  // §4.2.5 Age Preference
  {
    id: "fb_age",
    type: "feedback_collect",
    position: { x: 1600, y: 2000 },
    data: {
      label: "Age / Life Stage",
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
  },

  // §4.2.6 Location
  {
    id: "fb_location",
    type: "feedback_collect",
    position: { x: 2100, y: 2000 },
    data: {
      label: "Location",
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
  },

  // §4.2.7 Can't Explain It
  {
    id: "fb_gut_feeling",
    type: "feedback_collect",
    position: { x: 2600, y: 2000 },
    data: {
      label: "Can't Explain It",
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
  },

  // §4.2.8 Something Else (free text / voice note)
  {
    id: "fb_other",
    type: "feedback_collect",
    position: { x: 3100, y: 2000 },
    data: {
      label: "Something Else (Free Text)",
      config: {
        feedbackType: "other",
        prompt: "No problem — feel free to type it out or send a voice note, and we'll take it from here.",
        categories: [],
        allowFreeText: true,
        timeout: 86400000,
        timeoutMessage: "Hey {{memberFirstName}}, still here whenever you're ready to share!",
      },
    },
  },

  // ── §4.3 Recursive Loop — "Anything else?" ─────────────────────────────
  // Asked after every secondary question EXCEPT "other" (something else).
  // If Yes → loop back to §4.1 primary reason list.
  // If No  → proceed to §4.4 closing.
  {
    id: "decision_more_reasons",
    type: "decision",
    position: { x: 2000, y: 2800 },
    data: {
      label: "Anything Else?",
      config: {
        question:
          "Got it, thank you. Is there anything else that didn't feel right?",
        options: [
          {
            value: "more_reasons_yes",
            label: "Yes",
            edgeId: "edge_more_yes",
          },
          {
            value: "more_reasons_no",
            label: "No",
            edgeId: "edge_more_no",
          },
        ],
        timeout: 86400000,
        timeoutEdgeId: "edge_nudge_more_reasons",
      },
    },
  },

  // ── §4.4 Closing + System Actions ──────────────────────────────────────
  {
    id: "msg_closing",
    type: "message",
    position: { x: 2000, y: 3500 },
    data: {
      label: "Closing — Thanks",
      config: {
        template:
          "Thanks for sharing — this really helps us dial in your matches. We'll use this to refine who we send your way next. Talk soon!",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "action_reject",
    type: "action",
    position: { x: 2000, y: 4100 },
    data: {
      label: "Reject + Write Notes",
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
  },
  {
    id: "end_rejected",
    type: "end",
    position: { x: 2000, y: 4700 },
    data: {
      label: "End (Rejected)",
      config: { endType: "completed" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §5 — FLOW C: UPSELL (MEMBER REQUESTS MORE INFO / INTRO)
  // ══════════════════════════════════════════════════════════════════════════

  // §5.1 — Upsell pitch
  {
    id: "decision_upsell",
    type: "decision",
    position: { x: 4500, y: 1200 },
    data: {
      label: "Upsell: Curated Outreach",
      config: {
        question:
          "Great question! What you received is the full profile we're able to share at this stage.\n\nIf you'd like to go deeper, we can personally reach out to this person on your behalf and represent you. This is an additional concierge service.\n\nHow it works:\n- Total cost: $250\n- $125 upfront to initiate outreach\n- $125 only if the other party agrees to connect\n\nThere are no guarantees — but we always try our best. Would you like to activate this?",
        options: [
          {
            value: "upsell_yes",
            label: "Yes, activate",
            edgeId: "edge_upsell_yes",
          },
          {
            value: "upsell_no",
            label: "No, I'll pass",
            edgeId: "edge_upsell_no",
          },
        ],
        timeout: 86400000,
        timeoutEdgeId: "edge_nudge_upsell",
      },
    },
  },

  // §5.2 — Upsell Accepted → Create Stripe checkout + send link via WhatsApp
  {
    id: "action_create_payment",
    type: "action",
    position: { x: 4200, y: 2000 },
    data: {
      label: "Create Payment Link",
      config: {
        actionType: "create_stripe_link",
        params: {
          amount: 12500, // $125 in cents
          phase: "initial",
        },
      },
    },
  },
  // §5.2 — Post-payment confirmation message
  {
    id: "msg_payment_confirmed",
    type: "message",
    position: { x: 4200, y: 2600 },
    data: {
      label: "Payment Confirmed",
      config: {
        template:
          "Payment received — thank you, {{memberFirstName}}! 🎉\n\nWe're now reaching out to your match on your behalf. We'll keep you updated right here on WhatsApp as soon as we hear back.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "end_upsell_yes",
    type: "end",
    position: { x: 4200, y: 3200 },
    data: {
      label: "End (Pending — Outreach Initiated)",
      config: { endType: "completed" },
    },
  },

  // §5.3 — Upsell Declined → "Still interested?"
  {
    id: "decision_upsell_followup",
    type: "decision",
    position: { x: 5200, y: 2000 },
    data: {
      label: "Still Interested?",
      config: {
        question:
          "No problem at all! Based on the profile, are you still interested in this match, or would you like to pass?",
        options: [
          {
            value: "upsell_pass_interested",
            label: "I'm interested",
            edgeId: "edge_upsell_pass_interested",
          },
          {
            value: "upsell_pass_not_interested",
            label: "Not interested",
            edgeId: "edge_upsell_pass_not_interested",
          },
        ],
        timeout: 86400000,
        timeoutEdgeId: "edge_nudge_followup",
      },
    },
  },

  // §5.3.2 — Not interested → close match
  {
    id: "msg_upsell_pass",
    type: "message",
    position: { x: 5600, y: 2700 },
    data: {
      label: "Pass Closing",
      config: {
        template:
          "No problem. If something shifts or you'd like to reach out later, just let us know. We're always here.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "action_upsell_pass",
    type: "action",
    position: { x: 5600, y: 3300 },
    data: {
      label: "Move to Past Introductions",
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
  },
  {
    id: "end_upsell_pass",
    type: "end",
    position: { x: 5600, y: 3900 },
    data: {
      label: "End (Past Introductions)",
      config: { endType: "completed" },
    },
  },

  // ── Decision Nudge Nodes ──────────────────────────────────────────────────
  // Sent after 24h timeout on each decision node, then loop back to re-ask.
  {
    id: "msg_nudge_why_not",
    type: "message",
    position: { x: 2700, y: 1200 },
    data: {
      label: "Nudge — Why Not?",
      config: {
        template:
          "Hey {{memberFirstName}}, just checking in — take your time, but we'd love to hear your thoughts when you're ready.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "msg_nudge_more_reasons",
    type: "message",
    position: { x: 2700, y: 2800 },
    data: {
      label: "Nudge — More Reasons?",
      config: {
        template:
          "Hey {{memberFirstName}}, just checking in — no rush!",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "msg_nudge_upsell",
    type: "message",
    position: { x: 5200, y: 1200 },
    data: {
      label: "Nudge — Upsell",
      config: {
        template:
          "Hey {{memberFirstName}}, just checking in — take your time with this, no pressure at all.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "msg_nudge_followup",
    type: "message",
    position: { x: 5900, y: 2000 },
    data: {
      label: "Nudge — Followup",
      config: {
        template:
          "Hey {{memberFirstName}}, still here whenever you're ready!",
        channel: "whatsapp",
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §6 — FLOW D: NO RESPONSE — Nudge + re-ask
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "msg_no_response_nudge",
    type: "message",
    position: { x: -400, y: 1200 },
    data: {
      label: "Nudge — No Response",
      config: {
        template:
          "Hey {{memberFirstName}}, just checking in! Did you get a chance to review the profile we sent? We'd love to hear your thoughts whenever you're ready.",
        channel: "whatsapp",
      },
    },
  },
]

// ============================================================================
// Edges (35 total)
// ============================================================================

export const defaultEdges: Edge[] = [
  // ── §2 Start → Decision (intro + buttons combined in one message) ───
  {
    id: "e_start_decision",
    source: "start_1",
    target: "decision_response",
    type: "smoothstep",
    animated: true,
  },

  // ── §2 Member Response → 4 flows ──────────────────────────────────────
  {
    id: "edge_interested",
    source: "decision_response",
    target: "action_interested",
    sourceHandle: "edge_interested",
    label: "I'm interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_not_interested",
    source: "decision_response",
    target: "decision_why_not",
    sourceHandle: "edge_not_interested",
    label: "Not interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_upsell_intro",
    source: "decision_response",
    target: "decision_upsell",
    sourceHandle: "edge_upsell_intro",
    label: "More info / intro",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_no_resp",
    source: "decision_response",
    target: "msg_no_response_nudge",
    sourceHandle: "timeout",
    label: "No response (timeout)",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },

  // ── §3 Flow A: Interested → End (placeholder) ────────────────────────
  {
    id: "e_interested_end",
    source: "action_interested",
    target: "end_interested",
    type: "smoothstep",
    animated: true,
  },

  // ── §6 No Response nudge → loop back to decision (re-send) ───────────
  {
    id: "e_nudge_loop",
    source: "msg_no_response_nudge",
    target: "decision_response",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },

  // ── §4.1 Why Not Interested → 8 sub-category feedback nodes ──────────
  {
    id: "edge_physical",
    source: "decision_why_not",
    target: "fb_physical",
    sourceHandle: "edge_physical",
    label: "Physical",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_bio",
    source: "decision_why_not",
    target: "fb_bio",
    sourceHandle: "edge_bio",
    label: "Bio",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_career",
    source: "decision_why_not",
    target: "fb_career",
    sourceHandle: "edge_career",
    label: "Career",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_religious",
    source: "decision_why_not",
    target: "fb_religious",
    sourceHandle: "edge_religious",
    label: "Religious",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_age",
    source: "decision_why_not",
    target: "fb_age",
    sourceHandle: "edge_age",
    label: "Age",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_location",
    source: "decision_why_not",
    target: "fb_location",
    sourceHandle: "edge_location",
    label: "Location",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_gut_feeling",
    source: "decision_why_not",
    target: "fb_gut_feeling",
    sourceHandle: "edge_gut_feeling",
    label: "Gut feeling",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_other",
    source: "decision_why_not",
    target: "fb_other",
    sourceHandle: "edge_other",
    label: "Other",
    type: "smoothstep",
    animated: true,
  },

  // ── §4.3 Seven sub-categories → "Anything else?" loop ─────────────────
  // (NOT "other" — that one skips the loop and goes straight to closing)
  {
    id: "e_fb_physical_loop",
    source: "fb_physical",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_fb_bio_loop",
    source: "fb_bio",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_fb_career_loop",
    source: "fb_career",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_fb_religious_loop",
    source: "fb_religious",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_fb_age_loop",
    source: "fb_age",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_fb_location_loop",
    source: "fb_location",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_fb_gut_feeling_loop",
    source: "fb_gut_feeling",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
  },

  // §4.2.8 "Something else" → direct to closing (skips loop per spec)
  {
    id: "e_fb_other_closing",
    source: "fb_other",
    target: "msg_closing",
    type: "smoothstep",
    animated: true,
  },

  // ── §4.3 "Anything else?" decision ────────────────────────────────────
  // Yes → loop back to §4.1 reason list
  {
    id: "edge_more_yes",
    source: "decision_more_reasons",
    target: "decision_why_not",
    sourceHandle: "edge_more_yes",
    label: "Yes",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  // No → proceed to §4.4 closing
  {
    id: "edge_more_no",
    source: "decision_more_reasons",
    target: "msg_closing",
    sourceHandle: "edge_more_no",
    label: "No",
    type: "smoothstep",
    animated: true,
  },

  // ── §4.4 Closing → Reject → End ──────────────────────────────────────
  {
    id: "e_closing_reject",
    source: "msg_closing",
    target: "action_reject",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_reject_end",
    source: "action_reject",
    target: "end_rejected",
    type: "smoothstep",
    animated: true,
  },

  // ── §5.1 Upsell → Yes / No ───────────────────────────────────────────
  {
    id: "edge_upsell_yes",
    source: "decision_upsell",
    target: "action_create_payment",
    sourceHandle: "edge_upsell_yes",
    label: "Yes, activate",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_upsell_no",
    source: "decision_upsell",
    target: "decision_upsell_followup",
    sourceHandle: "edge_upsell_no",
    label: "No, I'll pass",
    type: "smoothstep",
    animated: true,
  },

  // ── §5.2 Upsell Yes → Payment → Confirmation msg → End ──────────────
  {
    id: "e_payment_confirmed",
    source: "action_create_payment",
    target: "msg_payment_confirmed",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_upsell_yes_end",
    source: "msg_payment_confirmed",
    target: "end_upsell_yes",
    type: "smoothstep",
    animated: true,
  },

  // ── §5.3 Upsell No → "Still interested?" → branches ──────────────────
  {
    id: "edge_upsell_pass_interested",
    source: "decision_upsell_followup",
    target: "action_create_payment",
    sourceHandle: "edge_upsell_pass_interested",
    label: "I'm interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_upsell_pass_not_interested",
    source: "decision_upsell_followup",
    target: "msg_upsell_pass",
    sourceHandle: "edge_upsell_pass_not_interested",
    label: "Not interested",
    type: "smoothstep",
    animated: true,
  },

  // §5.3.2 Pass → Action → End
  {
    id: "e_upsell_pass_action",
    source: "msg_upsell_pass",
    target: "action_upsell_pass",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_upsell_pass_end",
    source: "action_upsell_pass",
    target: "end_upsell_pass",
    type: "smoothstep",
    animated: true,
  },

  // ── Decision nudge timeout edges ──────────────────────────────────────
  {
    id: "edge_nudge_why_not",
    source: "decision_why_not",
    target: "msg_nudge_why_not",
    sourceHandle: "timeout",
    label: "Timeout nudge",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_nudge_why_not_loop",
    source: "msg_nudge_why_not",
    target: "decision_why_not",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "edge_nudge_more_reasons",
    source: "decision_more_reasons",
    target: "msg_nudge_more_reasons",
    sourceHandle: "timeout",
    label: "Timeout nudge",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_nudge_more_reasons_loop",
    source: "msg_nudge_more_reasons",
    target: "decision_more_reasons",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "edge_nudge_upsell",
    source: "decision_upsell",
    target: "msg_nudge_upsell",
    sourceHandle: "timeout",
    label: "Timeout nudge",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_nudge_upsell_loop",
    source: "msg_nudge_upsell",
    target: "decision_upsell",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "edge_nudge_followup",
    source: "decision_upsell_followup",
    target: "msg_nudge_followup",
    sourceHandle: "timeout",
    label: "Timeout nudge",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_nudge_followup_loop",
    source: "msg_nudge_followup",
    target: "decision_upsell_followup",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
]
