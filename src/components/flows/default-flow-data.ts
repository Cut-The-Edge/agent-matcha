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
    position: { x: 1075, y: 50 },
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
    position: { x: 1075, y: 300 },
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
    position: { x: 350, y: 600 },
    data: {
      label: "Flow A: Interested (TBD)",
      config: {
        actionType: "notify_admin",
        params: {
          placeholder: true,
          note: "PLACEHOLDER — Full interested flow TBD. Do not implement yet.",
        },
      },
    },
  },
  {
    id: "end_interested",
    type: "end",
    position: { x: 360, y: 800 },
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
    position: { x: 1075, y: 600 },
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
    position: { x: 200, y: 950 },
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
      },
    },
  },

  // §4.2.2 Bio Didn't Resonate
  {
    id: "fb_bio",
    type: "feedback_collect",
    position: { x: 450, y: 950 },
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
      },
    },
  },

  // §4.2.3 Career Ambitions Mismatch
  {
    id: "fb_career",
    type: "feedback_collect",
    position: { x: 700, y: 950 },
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
      },
    },
  },

  // §4.2.4 Religious Level Mismatch
  {
    id: "fb_religious",
    type: "feedback_collect",
    position: { x: 950, y: 950 },
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
      },
    },
  },

  // §4.2.5 Age Preference
  {
    id: "fb_age",
    type: "feedback_collect",
    position: { x: 1200, y: 950 },
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
      },
    },
  },

  // §4.2.6 Location
  {
    id: "fb_location",
    type: "feedback_collect",
    position: { x: 1450, y: 950 },
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
      },
    },
  },

  // §4.2.7 Can't Explain It
  {
    id: "fb_gut_feeling",
    type: "feedback_collect",
    position: { x: 1700, y: 950 },
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
      },
    },
  },

  // §4.2.8 Something Else (free text / voice note)
  {
    id: "fb_other",
    type: "feedback_collect",
    position: { x: 1950, y: 950 },
    data: {
      label: "Something Else (Free Text)",
      config: {
        feedbackType: "other",
        prompt: "No problem — feel free to type it out or send a voice note, and we'll take it from here.",
        categories: [],
        allowFreeText: true,
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
    position: { x: 1075, y: 1250 },
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
      },
    },
  },

  // ── §4.4 Closing + System Actions ──────────────────────────────────────
  {
    id: "msg_closing",
    type: "message",
    position: { x: 1075, y: 1500 },
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
    position: { x: 1075, y: 1700 },
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
    position: { x: 1075, y: 1900 },
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
    position: { x: 2300, y: 600 },
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
      },
    },
  },

  // §5.2 — Upsell Accepted
  {
    id: "msg_upsell_yes",
    type: "message",
    position: { x: 2150, y: 900 },
    data: {
      label: "Payment Link Sent",
      config: {
        template:
          "Great, I'll initiate the outreach on your behalf! To get started, please complete the first payment below.\n\n{{paymentLink}}",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "end_upsell_yes",
    type: "end",
    position: { x: 2150, y: 1120 },
    data: {
      label: "End (Pending — Post-payment TBD)",
      config: { endType: "completed" },
    },
  },

  // §5.3 — Upsell Declined → "Still interested?"
  {
    id: "decision_upsell_followup",
    type: "decision",
    position: { x: 2450, y: 900 },
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
      },
    },
  },

  // §5.3.1 — Still interested → Flow A (placeholder)
  {
    id: "end_upsell_interested",
    type: "end",
    position: { x: 2300, y: 1120 },
    data: {
      label: "End (Placeholder — Flow A TBD)",
      config: { endType: "completed" },
    },
  },

  // §5.3.2 — Not interested → close match
  {
    id: "msg_upsell_pass",
    type: "message",
    position: { x: 2600, y: 1120 },
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
    position: { x: 2600, y: 1350 },
    data: {
      label: "Move to Past Introductions",
      config: {
        actionType: "update_match_status",
        params: {
          final_status: "past",
          actions: [
            "Move match: Active Introductions → Past Introductions",
            "Write all collected info to Match Notes (declined upsell, passed on match)",
          ],
        },
      },
    },
  },
  {
    id: "end_upsell_pass",
    type: "end",
    position: { x: 2600, y: 1550 },
    data: {
      label: "End (Past Introductions)",
      config: { endType: "completed" },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §6 — FLOW D: NO RESPONSE (PLACEHOLDER)
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "action_no_response",
    type: "action",
    position: { x: 0, y: 600 },
    data: {
      label: "Flow D: No Response (TBD)",
      config: {
        actionType: "sync_to_sma",
        params: {
          placeholder: true,
          note: "PLACEHOLDER — Follow-up cadence and escalation logic TBD. Define: timing of follow-up nudges, max attempts, and final disposition.",
        },
      },
    },
  },
  {
    id: "end_no_response",
    type: "end",
    position: { x: 10, y: 800 },
    data: {
      label: "End (Placeholder)",
      config: { endType: "completed" },
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
    target: "action_no_response",
    sourceHandle: "timeout",
    label: "No response (24h timeout)",
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

  // ── §6 Flow D: No Response → End (placeholder) ───────────────────────
  {
    id: "e_no_resp_end",
    source: "action_no_response",
    target: "end_no_response",
    type: "smoothstep",
    animated: true,
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
    target: "msg_upsell_yes",
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

  // ── §5.2 Upsell Yes → Payment → End (pending) ────────────────────────
  {
    id: "e_upsell_yes_end",
    source: "msg_upsell_yes",
    target: "end_upsell_yes",
    type: "smoothstep",
    animated: true,
  },

  // ── §5.3 Upsell No → "Still interested?" → branches ──────────────────
  {
    id: "edge_upsell_pass_interested",
    source: "decision_upsell_followup",
    target: "end_upsell_interested",
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
]
