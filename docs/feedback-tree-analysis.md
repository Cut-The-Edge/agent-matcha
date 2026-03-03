# Agent Matcha — WhatsApp Feedback Decision Tree Analysis

> Extracted from Dani's Canva flowchart: "Agent Matcha - To Be Triggered Every Time a Match is Started"
> Source: `/Users/adialia/Downloads/Agent Matcha Feedback Tree.png`

---

## Legend (Color Coding)

| Shape/Color | Meaning |
|---|---|
| **Purple** rounded rect | Member Profile |
| **Yellow** circle | Inner Client/Member Perspective |
| **Pink** rectangle | Agent ↔ Member Communication (bot messages) |
| **Red/Pink** triangle | Agent Matcha Action |
| **Cyan** triangle | Data write → SmartMatchApp (Match Notes) |
| **Green** circle | Flow entry point |

---

## Flow Entry Point

**Trigger:** Every time a match is started in SmartMatchApp — member is moved to "Active Introductions."

> "Start or team receives a match into the Match Category within the system/app 'Active Introductions' — this means the match is personally being worked on. Right now the following process is done manually but would like it to be done automatically."

**Cross-reference fields to check:** Active Status, Check-In, Force Enter Client Match, New Search Template, Post Processed Introduction Created, Goals Status, New Prompt, Up Start, or SMS.

---

## Main Branch — 4 Member Response States

From the Member Profile entry point, the flow branches into:

### 1. Member Response: **Interested** (orange circle, left)
### 2. Member Says No / **Request to Reschedule Call** (orange circle, center-left)
### 3. Member **Proposes Meet / Match is Good** — wants to proceed via email/FaceTime (orange circle, center-right)
### 4. Member Response: **Not Interested** (yellow circle, right)

---

## Branch 4: NOT INTERESTED — Full Feedback Flow

### Step 1: Empathetic Acknowledgment + Follow-Up

Bot message:
> "I totally get it. I'm here to help you find that amazing match. Just so I can refine your future matches and really understand what you're looking for — would you mind sharing a bit about what didn't click? It doesn't have to be anything long. I'm just personally only doing this to ensure to match it right. Let me introduce and I'll be reaching out."

### Step 2: Quick-Tap Feedback Categories (8 options)

The bot presents these quick-tap button categories:

| # | Category | Follow-Up Detail |
|---|----------|-----------------|
| 1 | **Physical Attraction** | "Tell me a bit more about what you're looking for — any specific features? Hair color, build, height, style? The more detail, the better I can match." |
| 2 | **Based from photos only or general?** | "Were the photos enough to decide, or is it more of a general feeling? Did you want to see more photos, or was it enough to know?" |
| 3 | **Can we establish mutual chemistry?** | "Sometimes photos don't capture chemistry. Description of what kind feel right — energy, warmth, humor? I'll connect to verify. Whatever you feel comfortable sharing." |
| 4 | **Willingness to meet/response?** | "If you weren't ready to commit to meeting yet — that's okay. Let us know what would help. Are you open to a phone call or video before meeting in person?" |
| 5 | **Age preference** | "What's the age range you're most comfortable with? And would you consider flexibility if the rest of the match is strong?" |
| 6 | **Location** | "Is this about proximity or general area? How far are you willing to go? City preference? I can make that a priority for future matches." |
| 7 | **Career/Income — I can tell** | "Noted. I understand this is important. I'll keep this preference in mind for future introductions. Is this about lifestyle fit, ambition, or a specific field?" |
| 8 | **Something Specific — I'll find out** | "That would be great to know. If you have something on your mind — religious beliefs, political beliefs, lifestyle habits, kids situation? Feel free to spell it out, I'm here to make it work." |

### Step 3: Save to SmartMatchApp

After collecting feedback → write **Match Notes** to SmartMatchApp:

**Match Notes — "Not Interested" Structure:**
- Status: Not Interested
- Physical feedback
- Personality feedback
- Chemistry notes
- Attraction level
- Lifestyle alignment
- Additional info
- Interest level: None/Low
- Meta feedback (raw text)

### Step 4: Move match to "Rejected Introductions" in SmartMatchApp

### Step 5: Check rejection counter
- If 3+ rejections → trigger recalibration flow (see below)

---

## Branch 1: INTERESTED — Proposal Flow

### Step 1: Excitement + Next Steps

Bot message:
> "In this stage, what's going to happen is the following path: If you'd like me to go ahead and automatically... I would love to set up an in-person meet. Let me handle the scheduling and planning together with some insight and some ideas to make it great. I can personally only share a little in this regard to match. Let me introduce and I'll be reaching out."

### Step 2: Member Decision

**Option A: "Yes — Makes a proposal"**

Bot message:
> "Great! I'll initiate the introduction from our end. Through a personalized insight, this first introduction is special. I focus confidently and connect with them directly. I'll keep you updated as soon as we know more. If there's anything specific you'd like me to know, let me know."

→ **Action:** Notify Dani to proceed with mutual introduction

**Option B: "No thank you, I'll pass for now"**

Bot message:
> "No problem. With every Match to you there's no obligation. If something shifts or sounds good in a bit, just let us know — putting up is with their name and we'll take care of it."

→ **Action:** Move to "Past Introductions" (soft no, can revisit)

### Step 3: Save to SmartMatchApp

**Match Notes — "Interested" Structure:**
- Status: Interested
- Physical impression
- Personality impression
- Emotional connection notes
- Proposal details
- Other notes
- Fitness level
- Ideas/preferences
- Match Notes (free text)

---

## Branch 2 & 3: RESCHEDULE / WANTS TO MEET

These branches handle:
- Member who wants to reschedule their review of the match
- Member who proactively proposes meeting (phone/email/FaceTime)

→ Both feed into the **Interested** flow or require Dani's manual intervention.

---

## Re-Calibration Flow (After 3 Declined Matches)

> **"After 3 declined matches, offer a re-calibration call."**
>
> "A recalibration is a paid membership utility. After three declines, it's usually helpful to recalibrate together so we don't keep missing. Matches are typically aligned with Your Current Life/Lifestyle. Workflow and move forward intentionally."

**Trigger:** Rejection counter reaches 3 for a member.

**Bot message (suggested):**
> "I notice we haven't quite found the right match yet. After three tries, it's usually helpful to recalibrate together so we don't keep missing. Let's book a quick alignment call with Your Current Life so we can adjust our search and move forward intentionally."

**Action:** Send booking link for free recalibration call with Dani/Jane.

---

## State Machine Summary

```
                        ┌─── INTERESTED ─────── Yes (proposal) ──→ Notify Dani → Mutual Intro
                        │                    └── No (pass) ──────→ Past Introductions
                        │
MATCH CREATED ──→ WhatsApp Bot ──→ RESCHEDULE ──────────────────→ Reschedule handler
                        │
                        │      ┌── WANTS TO MEET ───────────────→ Interested flow
                        │
                        └─── NOT INTERESTED ──→ Feedback (8 categories)
                                                    │
                                                    ├──→ Save Match Notes
                                                    ├──→ Move to Rejected Introductions
                                                    └──→ Check counter (≥3 → Recalibration)
```

---

## Key Architecture Takeaways

1. **8 feedback categories** for "Not Interested" — each has its own follow-up script
2. **Match Notes** are structured differently for Interested vs Not Interested
3. **Two outcome buckets:** "Rejected Introductions" (hard no) vs "Past Introductions" (soft no / pass)
4. **Re-calibration** at 3 rejections is part of the paid membership utility
5. **Bot scripts are conversational** — not robotic. Warm, empathetic tone throughout
6. **Interested flow** has a second gate: member can still pass after learning the next steps
7. **All feedback writes back to SmartMatchApp** as Match Notes with structured fields
