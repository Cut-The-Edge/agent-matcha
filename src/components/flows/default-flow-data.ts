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
            label: "More info / intro",
            edgeId: "edge_upsell_intro",

          },
        ],
        // No Response: 2-day timeout starts the structured follow-up sequence (Day 2/5/7/8)
        timeout: 172800000, // 2 days
        timeoutEdgeId: "edge_timeout_day2",
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §3 — FLOW A: MEMBER IS INTERESTED
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "decision_interested_outreach",
    type: "decision",
    position: { x: 500, y: 1700 },
    data: {
      label: "Outreach Decision",
      config: {
        question:
          "Great — glad you're interested. Before making the introduction, we typically connect with them directly to learn a bit more and present you intentionally.\n\nWould you like us to initiate that outreach on your behalf?",
        options: [
          {
            value: "interested_yes",
            label: "Yes, start outreach",
            edgeId: "edge_interested_yes",
          },
          {
            value: "interested_pass",
            label: "Actually I'll pass",
            edgeId: "edge_interested_pass",
          },
        ],
        timeout: 86400000,
        timeoutEdgeId: "edge_nudge_interested_outreach",
      },
    },
  },
  {
    id: "msg_interested_prepayment",
    type: "message",
    position: { x: 500, y: 2200 },
    data: {
      label: "Pre-Payment — Interested",
      config: {
        template:
          "Perfect — I can do that. I'll reach out to them directly, share a bit about you, and gauge their interest before making a formal introduction.\n\nIt's $250 total, split into two parts — $125 now to initiate the outreach, and $125 only if they're interested in connecting. You can activate it here:",
        channel: "whatsapp",
      },
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
    position: { x: 1500, y: 4900 },
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
          "At this stage, what you've received is the full profile we're able to share.\n\nIf you'd like to go deeper, we offer a Curated Outreach service — we personally reach out to this person on your behalf, share a bit about you, and gauge their interest before making a formal introduction.\n\nHow it works:\n- Total cost: $250\n- $125 upfront to initiate outreach\n- $125 only if the other party is interested in connecting\n\nNo guarantees — but we present you intentionally and always do our best. Would you like to activate this?",
        options: [
          {
            value: "upsell_yes",
            label: "Yes, start outreach",
            edgeId: "edge_upsell_yes",
          },
          {
            value: "upsell_no",
            label: "No thanks, I'll pass",
            edgeId: "edge_upsell_no",
          },
        ],
        timeout: 86400000,
        timeoutEdgeId: "edge_nudge_upsell",
      },
    },
  },

  // §5.2 — Pre-payment message
  {
    id: "msg_upsell_initiate",
    type: "message",
    position: { x: 4200, y: 1700 },
    data: {
      label: "Initiate Outreach",
      config: {
        template:
          "Great. I'll initiate the outreach on your behalf. To begin, please complete the first $125 payment here:\n\nOnce confirmed, we'll connect with them directly, gather additional insight, and present you intentionally. I'll keep you updated as soon as we know more.\n\nIf there's anything specific you'd like us to ask or emphasize about you, send it here before we reach out.",
        channel: "whatsapp",
      },
    },
  },
  // §5.2 — Upsell Accepted → Create Stripe checkout + send link via WhatsApp
  {
    id: "action_create_payment",
    type: "action",
    position: { x: 4200, y: 2200 },
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
          "Payment received — we'll initiate outreach shortly. Our team will review the match and reach out directly to learn more and present you intentionally. We'll update you as soon as we have an answer.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "end_upsell_yes",
    type: "end",
    position: { x: 4200, y: 3200 },
    data: {
      label: "End (Human Touchpoint — Outreach)",
      config: { endType: "completed" },
    },
  },

  // §5.3.2 — Decline → close match (shared by Interested pass + Upsell no)
  {
    id: "msg_upsell_pass",
    type: "message",
    position: { x: 5600, y: 2700 },
    data: {
      label: "Pass Closing",
      config: {
        template:
          "No problem. We'll move {{matchFirstName}} to your Past Introductions for now.\n\nIf something shifts or you'd like us to reach out later, just ping us with their name and we'll take care of it.",
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
    id: "msg_nudge_interested_outreach",
    type: "message",
    position: { x: 200, y: 1700 },
    data: {
      label: "Nudge — Interested Outreach",
      config: {
        template:
          "Hey {{memberFirstName}}, just checking in — take your time, no pressure at all.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "action_notify_admin_outreach",
    type: "action",
    position: { x: 4200, y: 3000 },
    data: {
      label: "Notify Admin — Outreach",
      config: {
        actionType: "notify_admin",
        params: {
          notification:
            "Curated Outreach Requested — Member: {{memberFirstName}} {{memberLastName}}, Target Match: {{matchFirstName}} {{matchLastName}}, Payment: $125 received, Action Required: Schedule outreach call",
        },
      },
    },
  },

  // ══════════════════════════════════════════════════════════════════════════
  // §6 — FLOW D: STRUCTURED FOLLOW-UP SEQUENCE (Day 2 → 5 → 7 → 8 expire)
  // ══════════════════════════════════════════════════════════════════════════

  {
    id: "msg_followup_day2",
    type: "message",
    position: { x: -800, y: 800 },
    data: {
      label: "Follow-up Day 2",
      config: {
        template:
          "Just checking in on the introduction I sent over for {{matchFirstName}}. Introductions remain open for 7 days, so when you have a moment let me know if you're interested or not.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "decision_response_day2",
    type: "decision",
    position: { x: -800, y: 1200 },
    data: {
      label: "Response (Day 2)",
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
      },
    },
  },
  {
    id: "msg_followup_day5",
    type: "message",
    position: { x: -800, y: 1800 },
    data: {
      label: "Follow-up Day 5",
      config: {
        template:
          "Circling back on {{matchFirstName}}. This introduction will expire in a couple of days, so let me know if you'd like to proceed or pass before it closes.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "decision_response_day5",
    type: "decision",
    position: { x: -800, y: 2200 },
    data: {
      label: "Response (Day 5)",
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
      },
    },
  },
  {
    id: "msg_followup_day7",
    type: "message",
    position: { x: -800, y: 2800 },
    data: {
      label: "Follow-up Day 7",
      config: {
        template:
          "Quick final check on {{matchFirstName}}. Since introductions remain open for 7 days, I'll be moving this match to Past Introductions today if I don't hear back. Just let me know if you'd like to move forward before it expires.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "decision_response_day7",
    type: "decision",
    position: { x: -800, y: 3200 },
    data: {
      label: "Response (Day 7)",
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
      },
    },
  },
  {
    id: "msg_expire_day8",
    type: "message",
    position: { x: -800, y: 3800 },
    data: {
      label: "Expired — Day 8",
      config: {
        template:
          "Since I didn't hear back, I've moved {{matchFirstName}} to Past Introductions to keep your queue clear. If you change your mind later, just message me their name and we can reopen it.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "action_expire",
    type: "action",
    position: { x: -800, y: 4200 },
    data: {
      label: "Expire + Past Intro",
      config: {
        actionType: "expire_match",
        params: {
          target_status: "expired",
          response_type: "no_response",
          note: "No response after 8-day follow-up sequence. Moved to Past Introductions.",
          actions: [
            "Move match: Active Introductions → Past Introductions",
            "Log expiry reason in Match Notes",
          ],
        },
      },
    },
  },
  {
    id: "end_expired",
    type: "end",
    position: { x: -800, y: 4600 },
    data: {
      label: "End (Expired)",
      config: { endType: "expired" },
    },
  },

  // ── §4.4b — 3-DECLINE RECALIBRATION ──────────────────────────────────────
  {
    id: "condition_check_declines",
    type: "condition",
    position: { x: 2000, y: 4500 },
    data: {
      label: "Check Decline Count",
      config: {
        expression: "rejectionCount >= 3",
        trueEdgeId: "e_decline_recalibrate",
        falseEdgeId: "e_decline_ok",
      },
    },
  },
  {
    id: "msg_recalibration",
    type: "message",
    position: { x: 2500, y: 4900 },
    data: {
      label: "Recalibration Offer",
      config: {
        template:
          "I want to pause before sending another profile. After a few declines, it's usually helpful to recalibrate together so we don't keep missing.\n\nPlease book a quick alignment call here: {{recalibrationLink}}\n\nWe'll refine and move forward intentionally.",
        channel: "whatsapp",
      },
    },
  },
  {
    id: "action_recalibration",
    type: "action",
    position: { x: 2500, y: 5400 },
    data: {
      label: "Set Recalibrating",
      config: {
        actionType: "schedule_recalibration",
        params: {},
      },
    },
  },
  {
    id: "end_recalibration",
    type: "end",
    position: { x: 2500, y: 5800 },
    data: {
      label: "End (Recalibration)",
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
    target: "decision_interested_outreach",
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

  // ── §3 Flow A: Interested → Decision → Payment (or Pass)
  {
    id: "edge_interested_yes",
    source: "decision_interested_outreach",
    target: "msg_interested_prepayment",
    sourceHandle: "edge_interested_yes",
    label: "Yes, start outreach",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_interested_pass",
    source: "decision_interested_outreach",
    target: "msg_upsell_pass",
    sourceHandle: "edge_interested_pass",
    label: "Actually I'll pass",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_interested_prepay_action",
    source: "msg_interested_prepayment",
    target: "action_create_payment",
    type: "smoothstep",
    animated: true,
  },

  // ── §6 Structured follow-up chain (Day 2 → 5 → 7 → 8 expire) ────────
  {
    id: "edge_timeout_day2",
    source: "decision_response",
    target: "msg_followup_day2",
    sourceHandle: "timeout",
    label: "No response (Day 2)",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_day2_decision",
    source: "msg_followup_day2",
    target: "decision_response_day2",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day2_interested",
    source: "decision_response_day2",
    target: "decision_interested_outreach",
    sourceHandle: "edge_day2_interested",
    label: "I'm interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day2_not_interested",
    source: "decision_response_day2",
    target: "decision_why_not",
    sourceHandle: "edge_day2_not_interested",
    label: "Not interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day2_upsell",
    source: "decision_response_day2",
    target: "decision_upsell",
    sourceHandle: "edge_day2_upsell",
    label: "More info / intro",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_timeout_day5",
    source: "decision_response_day2",
    target: "msg_followup_day5",
    sourceHandle: "timeout",
    label: "No response (Day 5)",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_day5_decision",
    source: "msg_followup_day5",
    target: "decision_response_day5",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day5_interested",
    source: "decision_response_day5",
    target: "decision_interested_outreach",
    sourceHandle: "edge_day5_interested",
    label: "I'm interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day5_not_interested",
    source: "decision_response_day5",
    target: "decision_why_not",
    sourceHandle: "edge_day5_not_interested",
    label: "Not interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day5_upsell",
    source: "decision_response_day5",
    target: "decision_upsell",
    sourceHandle: "edge_day5_upsell",
    label: "More info / intro",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_timeout_day7",
    source: "decision_response_day5",
    target: "msg_followup_day7",
    sourceHandle: "timeout",
    label: "No response (Day 7)",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_day7_decision",
    source: "msg_followup_day7",
    target: "decision_response_day7",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day7_interested",
    source: "decision_response_day7",
    target: "decision_interested_outreach",
    sourceHandle: "edge_day7_interested",
    label: "I'm interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day7_not_interested",
    source: "decision_response_day7",
    target: "decision_why_not",
    sourceHandle: "edge_day7_not_interested",
    label: "Not interested",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_day7_upsell",
    source: "decision_response_day7",
    target: "decision_upsell",
    sourceHandle: "edge_day7_upsell",
    label: "More info / intro",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_timeout_day8",
    source: "decision_response_day7",
    target: "msg_expire_day8",
    sourceHandle: "timeout",
    label: "No response (Day 8)",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_expire_action",
    source: "msg_expire_day8",
    target: "action_expire",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_expire_end",
    source: "action_expire",
    target: "end_expired",
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
    id: "e_reject_check",
    source: "action_reject",
    target: "condition_check_declines",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_decline_ok",
    source: "condition_check_declines",
    target: "end_rejected",
    sourceHandle: "false",
    label: "< 3 declines",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_decline_recalibrate",
    source: "condition_check_declines",
    target: "msg_recalibration",
    sourceHandle: "true",
    label: "≥ 3 declines",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_recalibration_action",
    source: "msg_recalibration",
    target: "action_recalibration",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_recalibration_end",
    source: "action_recalibration",
    target: "end_recalibration",
    type: "smoothstep",
    animated: true,
  },

  // ── §5.1 Upsell → Yes / No ───────────────────────────────────────────
  {
    id: "edge_upsell_yes",
    source: "decision_upsell",
    target: "msg_upsell_initiate",
    sourceHandle: "edge_upsell_yes",
    label: "Yes, activate",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_initiate_payment",
    source: "msg_upsell_initiate",
    target: "action_create_payment",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "edge_upsell_no",
    source: "decision_upsell",
    target: "msg_upsell_pass",
    sourceHandle: "edge_upsell_no",
    label: "No thanks, I'll pass",
    type: "smoothstep",
    animated: true,
  },

  // ── §5.2 Upsell Yes → Payment → Confirmation → Admin Notify → End ───
  {
    id: "e_payment_confirmed",
    source: "action_create_payment",
    target: "msg_payment_confirmed",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_payment_to_notify",
    source: "msg_payment_confirmed",
    target: "action_notify_admin_outreach",
    type: "smoothstep",
    animated: true,
  },
  {
    id: "e_notify_to_end",
    source: "action_notify_admin_outreach",
    target: "end_upsell_yes",
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
    id: "edge_nudge_interested_outreach",
    source: "decision_interested_outreach",
    target: "msg_nudge_interested_outreach",
    sourceHandle: "timeout",
    label: "Timeout nudge",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
  {
    id: "e_nudge_interested_outreach_loop",
    source: "msg_nudge_interested_outreach",
    target: "decision_interested_outreach",
    type: "smoothstep",
    animated: true,
    style: { strokeDasharray: "8 4" },
  },
]
