# Agent Matcha — Voice Agent Research Brief

> **Purpose:** Complete technical documentation of the Club Allenby voice intake agent for latency optimization research.
> **Date:** 2026-03-19
> **Problem:** End-to-end response latency feels sluggish on phone calls — "like an old bot system." The goal is to identify and reduce every source of delay in the real-time voice pipeline.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Latency Chain Breakdown](#2-latency-chain-breakdown)
3. [Provider Stack & Models](#3-provider-stack--models)
4. [Current Tuning Parameters](#4-current-tuning-parameters)
5. [Pipeline Configuration Code](#5-pipeline-configuration-code)
6. [Full Source Code](#6-full-source-code)
7. [Dependencies & Deployment](#7-dependencies--deployment)
8. [Known Bottlenecks & Research Areas](#8-known-bottlenecks--research-areas)

---

## 1. Architecture Overview

```
                         PSTN Phone Call
                              │
                              ▼
                     ┌────────────────┐
                     │   Twilio SIP   │
                     │    Trunk       │
                     └───────┬────────┘
                             │ SIP/RTP
                             ▼
                     ┌────────────────┐
                     │  LiveKit Cloud │  (wss://agent-matcha-epj9rku0.livekit.cloud)
                     │  SIP Gateway   │
                     │  + Media Router│
                     └───────┬────────┘
                             │ WebRTC
                             ▼
                     ┌────────────────┐
                     │  Python Agent  │  (livekit-agents SDK v1.2+)
                     │  (this code)   │
                     └───────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
       ┌─────────┐   ┌─────────┐   ┌─────────┐
       │ Deepgram│   │OpenRouter│   │Cartesia │
       │  STT    │   │  LLM    │   │  TTS    │
       │ nova-3  │   │Gemini   │   │         │
       │         │   │3.1-flash│   │         │
       │         │   │-lite    │   │         │
       └─────────┘   └─────────┘   └─────────┘
                             │
                             ▼
                     ┌────────────────┐
                     │  Convex DB     │  (HTTP API — transcript, profiles)
                     └────────────────┘
```

### Real-time Voice Pipeline (per utterance)

```
User speaks → [VAD detects end-of-speech] → [Turn detector confirms] → [STT finalizes] → [LLM generates] → [TTS streams] → User hears
              ├── ~350ms silence ──────────┤├── endpointing ──────────┤├── STT latency ─┤├── TTFB ────────┤├── TTS latency ─┤
              │   (min_silence_duration)    ││  (200ms-1500ms)         ││  (~200-500ms)   ││  (~500-2000ms)  ││  (~200-500ms)  │
```

**Estimated total perceived latency: ~1.5s - 4.5s per turn** (from user stops speaking to agent audio starts playing)

---

## 2. Latency Chain Breakdown

Every millisecond in this chain compounds. Here's each stage with its current config:

| Stage | Component | Current Setting | Adds (est.) | Notes |
|-------|-----------|----------------|-------------|-------|
| 1. VAD silence detection | Silero VAD | `min_silence_duration=0.35s` | 350ms | Waits for 350ms of silence before considering speech done |
| 2. VAD speech threshold | Silero VAD | `activation_threshold=0.6` | ~0ms | Sensitivity — lower = more responsive, more false positives |
| 3. VAD min speech | Silero VAD | `min_speech_duration=0.1s` | ~0ms | Ignores utterances < 100ms (noise filter) |
| 4. Endpointing (min) | LiveKit Agents | `min_endpointing_delay=0.2s` | 200ms | Minimum wait after VAD says "silence" before declaring end-of-turn |
| 5. Endpointing (max) | LiveKit Agents | `max_endpointing_delay=1.5s` | 0-1300ms | Cap on how long the turn detector can deliberate |
| 6. Turn detection | Multilingual Model | (default params) | ~100-300ms | ML model decides if user is actually done or just pausing |
| 7. STT finalization | Deepgram nova-3 | streaming mode | ~200-500ms | Final transcript after endpointing — Deepgram streams interim results |
| 8. LLM TTFB | OpenRouter → Gemini 3.1 Flash Lite | streaming | ~500-2000ms | Time to first token from the LLM. **THIS IS THE BIGGEST VARIABLE.** Includes: OpenRouter routing overhead + Google API TTFB + network hops |
| 9. LLM token generation | Same | streaming | ~200-1000ms | Tokens stream to TTS as they arrive |
| 10. TTS synthesis | Cartesia | `speed=1.05` | ~200-500ms | Time to first audio chunk. Cartesia streams — first chunk arrives fast |
| 11. Network transport | LiveKit WebRTC → SIP → PSTN | — | ~50-150ms | WebRTC to SIP gateway + PSTN last mile |

### Biggest Latency Contributors (ranked)

1. **LLM TTFB via OpenRouter** (~500-2000ms) — Double network hop (agent → OpenRouter → Google). OpenRouter adds routing/auth overhead. This is likely the single largest source of perceived delay.
2. **Endpointing delay** (200-1500ms) — The turn detector + VAD silence detection window. Conservative settings mean the agent waits too long before starting to respond.
3. **STT finalization** (~200-500ms) — Deepgram streams interim results but the final transcript has a lag after speech ends.
4. **TTS first-chunk** (~200-500ms) — Cartesia is fast but there's still a synthesis startup cost.
5. **SIP/PSTN transport** (~50-150ms) — Fixed infrastructure latency, not much to optimize.

---

## 3. Provider Stack & Models

### Speech-to-Text (STT): Deepgram

| Property | Value |
|----------|-------|
| Provider | Deepgram |
| Model | `nova-3` |
| Mode | Streaming (real-time WebSocket) |
| Language | `en` |
| Smart format | `True` (numbers, dates, heights formatted) |
| Filler words | `True` (keeps "um", "uh" for natural feel) |
| Keyterms | `Club Allenby, Dani Bergman, Matcha, Ashkenazi, Sephardic, Mizrachi, Conservadox, Modern Orthodox, Shabbat, Shabbos, kosher` |
| Plugin | `livekit-plugins-deepgram>=1.2.0` |

### Large Language Model (LLM): Gemini via OpenRouter

| Property | Value |
|----------|-------|
| Provider | OpenRouter (OpenAI-compatible proxy) |
| Model | `google/gemini-3.1-flash-lite-preview` |
| Base URL | `https://openrouter.ai/api/v1` |
| Auth | `OPENROUTER_API_KEY` |
| Streaming | Yes (SSE) |
| Plugin | `livekit-plugins-openai>=1.2.0` (used with custom base_url) |
| Previous model | Was on direct Google Gemini API before (commit `3e847dd`), switched to OpenRouter |
| Preemptive generation | **Disabled** (commit `b89e7bb`) — caused empty content errors with Gemini |

**Note:** The LLM call goes through TWO network hops:
```
Python agent → OpenRouter (proxy) → Google Gemini API → back through OpenRouter → back to agent
```

### Text-to-Speech (TTS): Cartesia

| Property | Value |
|----------|-------|
| Provider | Cartesia |
| Voice ID | `e07c00bc-4134-4eae-9ea4-1a55fb45746b` |
| Speed | `1.05` (5% faster than normal) |
| Mode | Streaming |
| Plugin | `livekit-plugins-cartesia>=1.2.0` |

### Voice Activity Detection (VAD): Silero

| Property | Value |
|----------|-------|
| Provider | Silero |
| Min speech duration | `0.1s` (100ms) |
| Min silence duration | `0.35s` (350ms) |
| Activation threshold | `0.6` |
| Plugin | `livekit-plugins-silero>=1.2.0` |

### Turn Detection

| Property | Value |
|----------|-------|
| Model | `MultilingualModel` from `livekit-plugins-turn-detector` |
| Plugin | `livekit-plugins-turn-detector>=1.0.0` |

### Noise Cancellation

| Property | Value |
|----------|-------|
| Provider | LiveKit (Krisp-based) |
| Plugin | `livekit-plugins-noise-cancellation>=0.2.0` |

### Telephony

| Property | Value |
|----------|-------|
| SIP Provider | Twilio |
| Direction | Inbound + Outbound |
| LiveKit Cloud | `wss://agent-matcha-epj9rku0.livekit.cloud` |
| Deploy region | `us-east` |

---

## 4. Current Tuning Parameters

All latency-relevant parameters in one place:

```python
# ── AgentSession config (agent.py:1336-1374) ──

session = AgentSession(
    stt=deepgram.STT(
        model="nova-3",
        language="en",
        smart_format=True,
        filler_words=True,
        keyterm=[...],  # 11 domain-specific terms
    ),
    llm=openai_plugin.LLM(
        model="google/gemini-3.1-flash-lite-preview",
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    ),
    tts=cartesia.TTS(
        voice="e07c00bc-4134-4eae-9ea4-1a55fb45746b",
        speed=1.05,
    ),
    vad=silero.VAD.load(
        min_speech_duration=0.1,
        min_silence_duration=0.35,
        activation_threshold=0.6,
    ),
    turn_detection=MultilingualModel(),
    min_endpointing_delay=0.2,   # 200ms (default: 500ms)
    max_endpointing_delay=1.5,   # 1500ms (default: 3000ms)
)
```

### Parameter history (from git):

- `min_endpointing_delay`: reduced from default 500ms → 200ms
- `max_endpointing_delay`: reduced from default 3000ms → 1500ms
- `min_silence_duration`: reduced from 600ms → 350ms
- `min_speech_duration`: reduced from 150ms → 100ms
- `activation_threshold`: reduced from 0.65 → 0.6
- `speed` (TTS): increased from 1.0 → 1.05
- LLM: switched from OpenRouter → direct Google Gemini → back to OpenRouter (via `google/gemini-3.1-flash-lite-preview`)
- `preemptive_generation`: **disabled** — caused empty content errors with Gemini

---

## 5. Pipeline Configuration Code

The critical session creation block with all provider initialization:

```python
# From agent.py lines 1336-1374

session = AgentSession(
    stt=deepgram.STT(
        model="nova-3",
        language="en",
        smart_format=True,       # better formatting for numbers, dates, heights, incomes
        filler_words=True,       # keep "um", "uh" — persona uses them for natural feel
        keyterm=[                # boost recognition of domain-specific terms
            "Club Allenby",
            "Dani Bergman",
            "Matcha",
            "Ashkenazi",
            "Sephardic",
            "Mizrachi",
            "Conservadox",
            "Modern Orthodox",
            "Shabbat",
            "Shabbos",
            "kosher",
        ],
    ),
    llm=openai_plugin.LLM(
        model=LLM_MODEL,  # "google/gemini-3.1-flash-lite-preview"
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY", ""),
    ),
    tts=cartesia.TTS(
        voice="e07c00bc-4134-4eae-9ea4-1a55fb45746b",
        speed=1.05,              # slightly faster speech to reduce playback latency
    ),
    vad=silero.VAD.load(
        min_speech_duration=0.1,      # 100ms — detect speech faster
        min_silence_duration=0.35,    # 350ms — respond sooner after user stops
        activation_threshold=0.6,     # slightly more sensitive
    ),
    turn_detection=MultilingualModel(),
    # ── Latency optimizations ──
    min_endpointing_delay=0.2,        # 200ms min wait after user stops (default 500ms)
    max_endpointing_delay=1.5,        # 1.5s max wait cap (default 3.0s)
)
```

---

## 6. Full Source Code

### 6.1 `agent.py` — Main Agent (1555 lines)

The entry point. Contains the `MatchaAgent` class with function tools, guardrails (hostile detection, silence detection, duration limits), member context building, and the full entrypoint that wires everything together.

```python
"""
Agent Matcha — Voice intake agent for Club Allenby.

Entry point for the LiveKit Agents worker. Run with:
    python3 agent.py dev
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time

from dotenv import load_dotenv

from livekit import agents, api, rtc
from livekit.agents import (
    AgentSession,
    Agent,
    RunContext,
    WorkerOptions,
    function_tool,
    get_job_context,
)
from livekit.plugins import noise_cancellation, silero, deepgram, cartesia
from livekit.plugins import openai as openai_plugin
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from convex_client import ConvexClient
from call_handler import CallHandler, setup_transcript_listeners
from persona import (
    SYSTEM_PROMPT,
    PHASE_2_DEEP_DIVE_ADDENDUM,
    INBOUND_GREETING_INSTRUCTIONS,
    LLM_MODEL,
)
from flows.intake import (
    EXISTING_MEMBER_MOSTLY_COMPLETE,
    EXISTING_MEMBER_INCOMPLETE,
    UNKNOWN_CALLER_CONTEXT,
    OUTBOUND_GREETING,
    OUTBOUND_CONTEXT,
    OUTBOUND_BAD_TIME_INSTRUCTIONS,
    IDENTITY_CONFIRMED_CONTEXT,
    IDENTITY_WRONG_NAME_CONTEXT,
    NEW_CALLER_COLLECT_EMAIL_CONTEXT,
    LOOKUP_FAILED_CONTEXT,
)

load_dotenv()

logger = logging.getLogger("matcha-agent")

# ── Guardrail constants ──────────────────────────────────────────────

# Hostile language patterns — words/phrases that signal abusive callers.
# Matched case-insensitively against the full user utterance.
_HOSTILE_PATTERNS: list[re.Pattern] = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bfuck\s*you\b",
        r"\bfuck\s*off\b",
        r"\bgo\s*fuck\b",
        r"\bshut\s*(the\s*)?fuck\s*up\b",
        r"\bbullshit\b",
        r"\bpiece\s*of\s*shit\b",
        r"\bstupid\s*(ass|bitch|bot|machine|ai)\b",
        r"\bdumb\s*(ass|bitch|bot|machine|ai)\b",
        r"\byou'?re?\s*(an?\s*)?(idiot|moron|stupid|useless|worthless|trash|garbage)\b",
        r"\bkill\s*your\s*self\b",
        r"\bkys\b",
        r"\bwaste\s*of\s*(my\s*)?time\b",
        r"\bscam(mer)?\b",
        r"\bfraud\b",
        r"\bgo\s*to\s*hell\b",
        r"\bsuck\s*my\b",
        r"\bscrew\s*you\b",
        r"\bbitch\b",
        r"\bass\s*hole\b",
        r"\bcunt\b",
    ]
]

# Seconds of silence before prompting "are you still there?"
_SILENCE_THRESHOLD_SECS = 10.0

# Seconds of silence after the "are you still there?" prompt
# before concluding the caller is gone.
_SILENCE_AFTER_PROMPT_SECS = 10.0

# Hard limit on call duration (45 minutes — cost control)
_HARD_LIMIT_SECS = 45 * 60

# "10 minutes left" warning (fires at 35 min)
_WRAP_UP_WARNING_SECS = 35 * 60

# "2 minutes left" final warning (fires at 43 min)
_FINAL_WARNING_SECS = 43 * 60

# Off-topic redirect threshold — after this many consecutive off-topic
# user turns, the agent should redirect more firmly.
_OFF_TOPIC_REDIRECT_THRESHOLD = 2


def _is_hostile(text: str) -> bool:
    """Return True if the text matches any hostile language pattern."""
    return any(pat.search(text) for pat in _HOSTILE_PATTERNS)


# ── Agent class with function tools ──────────────────────────────────

class MatchaAgent(Agent):
    """Club Allenby intake agent with function calling tools."""

    def __init__(
        self,
        *,
        convex: ConvexClient,
        call_handler: CallHandler,
    ) -> None:
        super().__init__(instructions=SYSTEM_PROMPT)
        self._convex = convex
        self._call_handler = call_handler

        # ── Phase tracking ──
        self._phase2_active: bool = False

        # ── Guardrail state ──
        self._hostile_strike_count: int = 0
        self._off_topic_count: int = 0
        self._silence_timer_task: asyncio.Task | None = None
        self._silence_prompted: bool = False  # True after "are you still there?"
        self._duration_warned: bool = False  # True once we issue the wrap-up warning
        self._final_warned: bool = False  # True once we issue the "2 min left" warning
        self._duration_check_task: asyncio.Task | None = None
        self._call_start_time: float = 0.0

    @function_tool()
    async def save_intake_data(
        self,
        context: RunContext,
        first_name: str | None = None,
        last_name: str | None = None,
        age: int | None = None,
        location: str | None = None,
        hometown: str | None = None,
        willing_to_relocate: bool | None = None,
        ethnicity: str | None = None,
        occupation: str | None = None,
        family_info: str | None = None,
        jewish_observance: str | None = None,
        kosher_level: str | None = None,
        shabbat_observance: str | None = None,
        relationship_history: str | None = None,
        looking_for: str | None = None,
        physical_preferences: str | None = None,
        age_range_preference: str | None = None,
        must_haves: str | None = None,
        dealbreakers: str | None = None,
        marriage_timeline: str | None = None,
        kids_preference: str | None = None,
        day_in_life: str | None = None,
        hobbies: str | None = None,
        additional_notes: str | None = None,
        height: str | None = None,
        hair_color: str | None = None,
        eye_color: str | None = None,
        smoke: str | None = None,
        drink_alcohol: str | None = None,
        pets: str | None = None,
        languages: str | None = None,
        political_affiliation: str | None = None,
        education_level: str | None = None,
        college_details: str | None = None,
        weekend_preferences: str | None = None,
        friends_describe: str | None = None,
        organizations: str | None = None,
        personal_growth: str | None = None,
        what_you_notice: str | None = None,
        instagram: str | None = None,
        children_details: str | None = None,
        long_distance: str | None = None,
        nationality: str | None = None,
        sexual_orientation: str | None = None,
        birthdate: str | None = None,
        career_overview: str | None = None,
        relationship_status: str | None = None,
        income: str | None = None,
        upbringing: str | None = None,
        pref_seeking: str | None = None,
        pref_sexual_orientation: str | None = None,
        pref_relationship_status: str | None = None,
        pref_ethnicity: str | None = None,
        pref_religion: str | None = None,
        pref_education: str | None = None,
        pref_income: str | None = None,
        pref_height_range: str | None = None,
        pref_hair_color: str | None = None,
        pref_eye_color: str | None = None,
        pref_political: str | None = None,
        pref_smoking: str | None = None,
        pref_drinking: str | None = None,
        pref_children: str | None = None,
        pref_relocating: str | None = None,
        pref_partner_values: str | None = None,
        pref_partner_interests: str | None = None,
        membership_interest: str | None = None,
    ) -> dict:
        """Save NEW profile information gathered during THIS intake call.
        Call this ONCE at the end of the conversation after saying goodbye.

        CRITICAL: Only save information the caller EXPLICITLY told you during
        THIS conversation. Do NOT save data from the pre-loaded caller context
        or SMA profile — that data already exists in the CRM.
        """
        call_id = self._call_handler.call_id
        if not call_id:
            return {"saved": False, "reason": "no active call"}

        data = {}
        for key, val in [
            ("firstName", first_name),
            ("lastName", last_name),
            ("age", age),
            ("location", location),
            ("hometown", hometown),
            ("willingToRelocate", willing_to_relocate),
            ("ethnicity", ethnicity),
            ("occupation", occupation),
            ("familyInfo", family_info),
            ("jewishObservance", jewish_observance),
            ("kosherLevel", kosher_level),
            ("shabbatObservance", shabbat_observance),
            ("relationshipHistory", relationship_history),
            ("lookingFor", looking_for),
            ("physicalPreferences", physical_preferences),
            ("ageRangePreference", age_range_preference),
            ("mustHaves", must_haves),
            ("dealbreakers", dealbreakers),
            ("marriageTimeline", marriage_timeline),
            ("kidsPreference", kids_preference),
            ("dayInLife", day_in_life),
            ("hobbies", hobbies),
            ("additionalNotes", additional_notes),
            ("height", height),
            ("hairColor", hair_color),
            ("eyeColor", eye_color),
            ("smoke", smoke),
            ("drinkAlcohol", drink_alcohol),
            ("hasPets", pets),
            ("languages", languages),
            ("politicalAffiliation", political_affiliation),
            ("educationLevel", education_level),
            ("collegeDetails", college_details),
            ("weekendPreferences", weekend_preferences),
            ("friendsDescribe", friends_describe),
            ("organizations", organizations),
            ("personalGrowth", personal_growth),
            ("whatYouNotice", what_you_notice),
            ("instagram", instagram),
            ("childrenDetails", children_details),
            ("longDistance", long_distance),
            ("nationality", nationality),
            ("sexualOrientation", sexual_orientation),
            ("birthdate", birthdate),
            ("careerOverview", career_overview),
            ("relationshipStatus", relationship_status),
            ("income", income),
            ("upbringing", upbringing),
            ("prefSeeking", pref_seeking),
            ("prefSexualOrientation", pref_sexual_orientation),
            ("prefRelationshipStatus", pref_relationship_status),
            ("prefEthnicity", pref_ethnicity),
            ("prefReligion", pref_religion),
            ("prefEducation", pref_education),
            ("prefIncome", pref_income),
            ("prefHeightRange", pref_height_range),
            ("prefHairColor", pref_hair_color),
            ("prefEyeColor", pref_eye_color),
            ("prefPolitical", pref_political),
            ("prefSmoking", pref_smoking),
            ("prefDrinking", pref_drinking),
            ("prefChildren", pref_children),
            ("prefRelocating", pref_relocating),
            ("prefPartnerValues", pref_partner_values),
            ("prefPartnerInterests", pref_partner_interests),
            ("membershipInterest", membership_interest),
        ]:
            if val is not None:
                data[key] = val

        if not data:
            logger.info("[save_intake_data] No data provided — skipping save")
            return {"saved": False, "reason": "no data provided"}

        logger.info("[save_intake_data] Saving %d fields: %s", len(data), list(data.keys()))
        await self._convex.save_intake_data(call_id=call_id, data=data)
        logger.info("[save_intake_data] Successfully saved to Convex")
        return {"saved": True}

    @function_tool()
    async def send_data_request_link(self, context: RunContext) -> dict:
        """Send a profile completion form link to the member via WhatsApp.
        Call this when the member has missing profile data (photo, email,
        Instagram, TikTok, LinkedIn, location) OR when they want to UPDATE
        any of that data."""
        member = self._call_handler.member
        if not member or not member.get("_id"):
            return {"sent": False, "reason": "no member found"}

        logger.info("[send_data_request_link] Sending form to member %s", member.get("firstName"))
        result = await self._convex.send_data_request(member_id=member["_id"])
        if result.get("alreadyPending"):
            logger.info("[send_data_request_link] Already had a pending request — resent")
            return {"sent": True, "note": "A form link was already pending — resent it"}
        logger.info("[send_data_request_link] New form link created and sent")
        return {"sent": True}

    @function_tool()
    async def transfer_call(
        self,
        context: RunContext,
        transfer_to: str,
    ) -> str:
        """Transfer the call to a real person (warm transfer via SIP).

        Args:
            transfer_to: Who to transfer to — "dani" or "jane".
        """
        phone_map = {
            "dani": os.environ.get("DANI_PHONE"),
            "jane": os.environ.get("JANE_PHONE"),
        }
        target_phone = phone_map.get(transfer_to.lower().strip())
        if not target_phone:
            logger.warning("[transfer_call] Unknown transfer target: %s", transfer_to)
            return f"Sorry, I don't have a number for '{transfer_to}'. I can transfer to Dani or Jane."

        logger.info("[transfer_call] Transferring to %s at %s", transfer_to, target_phone)

        try:
            job_ctx = get_job_context()
            room = job_ctx.room

            sip_participant = None
            for p in room.remote_participants.values():
                if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                    sip_participant = p
                    break

            if not sip_participant:
                logger.error("[transfer_call] No SIP participant found in room")
                return "I'm sorry, I wasn't able to connect the transfer."

            lk_api = job_ctx.api
            await lk_api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=room.name,
                    participant_identity=sip_participant.identity,
                    transfer_to=f"sip:{target_phone}@sip.twilio.com",
                )
            )

            logger.info("[transfer_call] SIP transfer initiated to %s", target_phone)
            await asyncio.sleep(2)
            await self._call_handler.on_call_end(status="transferred")
            return f"Transfer to {transfer_to} initiated."

        except Exception as e:
            logger.error("[transfer_call] Transfer failed: %s", e)
            return "I'm sorry, the transfer didn't go through."

    @function_tool()
    async def end_call(self, context: RunContext) -> str:
        """End the conversation. Call this after goodbye + save_intake_data."""
        logger.info("[end_call] Agent initiating call end — waiting 3s for goodbye audio")
        self._cancel_guardrail_timers()
        await asyncio.sleep(3)
        logger.info("[end_call] Sending call-ended to Convex before shutdown")
        await self._call_handler.on_call_end()
        logger.info("[end_call] Calling shutdown()")
        get_job_context().shutdown()
        return "Call ended."

    @function_tool()
    async def start_deep_dive(self, context: RunContext) -> str:
        """Activate Phase 2 — the deep dive personal conversation.
        Call this AFTER save_intake_data with the CRM data."""
        if self._phase2_active:
            return "Phase 2 is already active."

        self._phase2_active = True
        self._instructions += PHASE_2_DEEP_DIVE_ADDENDUM
        logger.info("[start_deep_dive] Phase 2 activated — deep dive instructions injected")

        call_id = self._call_handler.call_id
        if call_id:
            try:
                await self._convex.save_intake_data(
                    call_id=call_id, data={"phase2Started": True}
                )
            except Exception:
                pass

        return "Phase 2 activated. Transition naturally into the deeper conversation."

    @function_tool()
    async def save_deep_dive_data(
        self,
        context: RunContext,
        matchmaker_note: str,
        attachment_style: str | None = None,
        communication_style: str | None = None,
        energy_level: str | None = None,
        life_stage: str | None = None,
        emotional_maturity: str | None = None,
        social_style: str | None = None,
        love_language: str | None = None,
        conflict_style: str | None = None,
        conversation_summary: str | None = None,
    ) -> dict:
        """Save the deep dive insights from Phase 2 of the conversation."""
        call_id = self._call_handler.call_id
        if not call_id:
            return {"saved": False, "reason": "no active call"}

        tags = {}
        for key, val in [
            ("attachment_style", attachment_style),
            ("communication_style", communication_style),
            ("energy_level", energy_level),
            ("life_stage", life_stage),
            ("emotional_maturity", emotional_maturity),
            ("social_style", social_style),
            ("love_language", love_language),
            ("conflict_style", conflict_style),
        ]:
            if val is not None:
                tags[key] = val

        data = {
            "matchmakerNote": matchmaker_note,
            "tags": tags,
            "conversationSummary": conversation_summary or "",
        }

        logger.info("[save_deep_dive_data] Saving deep dive: note=%d chars, %d tags",
                     len(matchmaker_note), len(tags))
        await self._convex.save_deep_dive_data(call_id=call_id, data=data)
        return {"saved": True}

    @function_tool()
    async def transfer_to_human(self, context: RunContext) -> str:
        """Transfer the caller to a human team member (hostile/escalated calls)."""
        logger.info("[transfer_to_human] Transferring caller to human — saving data first")
        self._cancel_guardrail_timers()
        await asyncio.sleep(2)
        await self._call_handler.on_call_end(status="transferred")
        get_job_context().shutdown()
        return "Call transferred."

    # ── Guardrail helpers (not tools) ─────────────────────────────────

    def _cancel_guardrail_timers(self):
        """Cancel any active silence / duration timer tasks."""
        if self._silence_timer_task and not self._silence_timer_task.done():
            self._silence_timer_task.cancel()
            self._silence_timer_task = None
        if self._duration_check_task and not self._duration_check_task.done():
            self._duration_check_task.cancel()
            self._duration_check_task = None

    def _reset_silence_timer(self, session: AgentSession):
        """Reset the silence detection timer — called on every user utterance."""
        if self._silence_timer_task and not self._silence_timer_task.done():
            self._silence_timer_task.cancel()

        self._silence_prompted = False
        self._silence_timer_task = asyncio.create_task(
            self._silence_watchdog(session)
        )

    async def _silence_watchdog(self, session: AgentSession):
        """Background task: wait for silence threshold, then prompt."""
        try:
            await asyncio.sleep(_SILENCE_THRESHOLD_SECS)
            logger.info("[guardrail:silence] No speech for %ds — prompting caller",
                        int(_SILENCE_THRESHOLD_SECS))
            self._silence_prompted = True
            await session.generate_reply(
                instructions=(
                    "The caller has been silent for a while. "
                    "Say: 'Hey, are you still there?' in a warm, checking-in tone."
                ),
            )

            await asyncio.sleep(_SILENCE_AFTER_PROMPT_SECS)
            logger.info("[guardrail:silence] Still silent after prompt — ending call")
            if self._phase2_active:
                await session.generate_reply(
                    instructions=(
                        "The caller is still silent. Say: 'Looks like I might have "
                        "lost you. I'll save everything — feel free to call back!' "
                        "Then call save_deep_dive_data + end_call."
                    ),
                )
            else:
                await session.generate_reply(
                    instructions=(
                        "The caller is still silent. Say: 'Looks like I might have "
                        "lost you. I'll save everything — feel free to call back!' "
                        "Then call save_intake_data + end_call."
                    ),
                )
        except asyncio.CancelledError:
            pass

    async def _duration_watchdog(self, session: AgentSession):
        """Background task: 3-stage duration management (35min / 43min / 45min)."""
        try:
            # Stage 1: Wrap-up warning at 35 minutes
            remaining = _WRAP_UP_WARNING_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            if not self._duration_warned:
                self._duration_warned = True
                logger.info("[guardrail:duration] 35-min mark — 10 minutes left")
                if self._phase2_active:
                    await session.generate_reply(
                        instructions="You have about 10 minutes left. Wrap up Phase 2 with 1-2 key questions.",
                    )
                else:
                    await session.generate_reply(
                        instructions="You have about 10 minutes left. Prioritize remaining missing fields.",
                    )

            # Stage 2: Final warning at 43 minutes
            remaining = _FINAL_WARNING_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            if not self._final_warned:
                self._final_warned = True
                logger.info("[guardrail:duration] 43-min mark — 2 minutes left")
                if self._phase2_active:
                    await session.generate_reply(
                        instructions="URGENT: 2 minutes left. Say goodbye, save_deep_dive_data, end_call NOW.",
                    )
                else:
                    await session.generate_reply(
                        instructions="URGENT: 2 minutes left. Say goodbye, save_intake_data, end_call NOW.",
                    )

            # Stage 3: Hard cut at 45 minutes
            remaining = _HARD_LIMIT_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            logger.warning("[guardrail:duration] 45-min HARD LIMIT — force ending call")
            self._cancel_guardrail_timers()
            await self._call_handler.on_call_end()
            get_job_context().shutdown()

        except asyncio.CancelledError:
            pass


# ── SMA Profile Field Definitions ─────────────────────────────────────

SMA_PROFILE_FIELDS: dict[str, tuple[str, str]] = {
    "gender": ("Gender", "Basic Information"),
    "sexualOrientation": ("Sexual Orientation", "Basic Information"),
    "birthdate": ("Birthdate", "Basic Information"),
    "age": ("Age", "Basic Information"),
    "relationshipStatus": ("Relationship Status", "Basic Information"),
    "ethnicity": ("Ethnicity", "Basic Information"),
    "height": ("Height", "Basic Information"),
    "hairColor": ("Hair Color", "Basic Information"),
    "eyeColor": ("Eye Color", "Basic Information"),
    "languages": ("Languages", "Basic Information"),
    "politicalAffiliation": ("Political Affiliation", "Basic Information"),
    "smoke": ("Smoke", "Basic Information"),
    "drinkAlcohol": ("Drink Alcohol", "Basic Information"),
    "hasPets": ("Pets", "Basic Information"),
    "longDistance": ("Open to Long Distance", "Basic Information"),
    "lookingForPartner": ("Looking for Partner", "Basic Information"),
    "interests": ("Interests", "Interests & Social Life"),
    "dayInLife": ("Day in Life", "Interests & Social Life"),
    "weekendPreferences": ("Weekend Preferences", "Interests & Social Life"),
    "friendsDescribe": ("How Friends Describe", "Interests & Social Life"),
    "organizations": ("Organizations", "Interests & Social Life"),
    "personalGrowth": ("Personal Growth", "Interests & Social Life"),
    "whatYouNotice": ("What You Notice in a Person", "Interests & Social Life"),
    "occupation": ("Occupation", "Career"),
    "careerOverview": ("Career Overview", "Career"),
    "income": ("Income", "Career"),
    "nationality": ("Nationality", "Background & Education"),
    "religion": ("Religion", "Background & Education"),
    "jewishObservance": ("Jewish Observance", "Background & Education"),
    "topValues": ("Top 3 Values", "Background & Education"),
    "upbringing": ("Upbringing & Family Values", "Background & Education"),
    "educationLevel": ("Education Level", "Background & Education"),
    "collegeDetails": ("College Details", "Background & Education"),
    "currentRelationshipStatus": ("Current Relationship Status", "Family & Relationships"),
    "relationshipHistory": ("Relationship History", "Family & Relationships"),
    "hasChildren": ("Has Children", "Family & Relationships"),
    "childrenDetails": ("Children Details", "Family & Relationships"),
    "wantChildren": ("Want Children", "Family & Relationships"),
}

SMA_PREFERENCE_FIELDS: dict[str, str] = {
    "seekingPartner": "Seeking Partner Who Is",
    "sexualOrientationPref": "Sexual Orientation Preference",
    "ageRange": "Age Range Preference",
    "relationshipStatusPref": "Relationship Status Preference",
    "ethnicityPref": "Ethnicity Preference",
    "religionPref": "Religion Preference",
    "educationPref": "Education Preference",
    "incomePref": "Income Preference",
    "heightRange": "Height Range",
    "hairColorPref": "Hair Color Preference",
    "eyeColorPref": "Eye Color Preference",
    "politicalPref": "Political Preference",
    "smokingPref": "Smoking Preference",
    "drinkingPref": "Drinking Preference",
    "childrenPref": "Children Preference",
    "willingToRelocate": "Open to Relocating",
    "partnerValues": "Partner Values",
    "partnerInterests": "Partner Interests",
    "partnerPersonality": "Partner Personality Description",
    "physicalCharacteristics": "Physical Characteristics",
}

_HIGH_PRIORITY_MISSING = {
    "ethnicity", "religion", "jewishObservance", "relationshipHistory",
    "occupation", "location", "age", "height",
}

_INTAKE_LABELS: dict[str, str] = {
    "firstName": "First name",
    "lastName": "Last name",
    "age": "Age",
    "birthdate": "Birthdate",
    "location": "Location",
    "hometown": "Hometown",
    "willingToRelocate": "Willing to relocate",
    "ethnicity": "Ethnicity",
    "occupation": "Occupation",
    "familyInfo": "Family info",
    "jewishObservance": "Jewish observance",
    "kosherLevel": "Kosher level",
    "shabbatObservance": "Shabbat observance",
    "relationshipHistory": "Relationship history",
    "lookingFor": "Looking for",
    "physicalPreferences": "Physical preferences",
    "ageRangePreference": "Age range preference",
    "mustHaves": "Must-haves",
    "dealbreakers": "Dealbreakers",
    "marriageTimeline": "Marriage timeline",
    "kidsPreference": "Kids preference",
    "dayInLife": "Day in life",
    "hobbies": "Hobbies",
    "additionalNotes": "Additional notes",
    "height": "Height",
    "hairColor": "Hair color",
    "eyeColor": "Eye color",
    "smoke": "Smoke",
    "drinkAlcohol": "Drink alcohol",
    "hasPets": "Pets",
    "languages": "Languages",
    "politicalAffiliation": "Political affiliation",
    "educationLevel": "Education level",
    "collegeDetails": "College details",
    "weekendPreferences": "Weekend preferences",
    "friendsDescribe": "How friends describe",
    "organizations": "Organizations",
    "personalGrowth": "Personal growth",
    "whatYouNotice": "What you notice",
    "instagram": "Instagram",
    "childrenDetails": "Children details",
    "longDistance": "Long distance",
    "nationality": "Nationality",
    "sexualOrientation": "Sexual orientation",
    "careerOverview": "Career overview",
    "relationshipStatus": "Relationship status",
    "income": "Income",
    "upbringing": "Upbringing",
}


def _build_member_context(member: dict) -> str:
    """Build a rich '## Caller context' block from full member data including SMA profile.

    Adapts the context instructions based on profile completeness:
    - Mostly complete (>70% fields filled): Short update flow
    - Incomplete: Guided intake with gaps highlighted
    """
    lines = [
        "## Caller context",
        "",  # Placeholder — replaced by completeness-based context block
        "",
        "**Basic info:**",
        (
            f"Name: {member.get('firstName', 'Unknown')}"
            f"{(' ' + member['lastName']) if member.get('lastName') else ''}"
            f" | Tier: {member.get('tier', 'unknown')}"
            f" | Status: {member.get('status', 'unknown')}"
            f" | Profile complete: {'Yes' if member.get('profileComplete') else 'No'}"
        ),
    ]

    client_details = member.get("clientDetails")
    if client_details:
        details_parts = []
        if client_details.get("id"):
            details_parts.append(f"SMA ID: {client_details['id']}")
        if client_details.get("created"):
            details_parts.append(f"Joined: {client_details['created'][:10]}")
        if client_details.get("assignedUsers"):
            names = ", ".join(u.get("name", "") for u in client_details["assignedUsers"] if u.get("name"))
            if names:
                details_parts.append(f"Assigned to: {names}")
        if details_parts:
            lines.append(" | ".join(details_parts))

    if member.get("matchmakerNotes"):
        lines += ["", "**Matchmaker notes:**", member["matchmakerNotes"]]

    if member.get("rejectionCount"):
        lines.append(f"\nRejection count: {member['rejectionCount']}")

    recal = member.get("recalibrationSummary")
    if recal:
        lines += ["", "**Recalibration:**"]
        if recal.get("summary"):
            lines.append(f"Pattern: {recal['summary']}")
        if recal.get("keyPatterns"):
            patterns = ", ".join(recal["keyPatterns"])
            count = recal.get("feedbackCount", "?")
            lines.append(f"Key patterns: {patterns} (from {count} feedback responses)")

    sma_profile = member.get("smaProfile") or {}
    sma_prefs = member.get("smaPreferences") or {}
    prev_intake = member.get("previousIntake") or {}

    all_data: dict[str, any] = {}
    all_data.update(prev_intake)
    all_data.update(sma_profile)

    filled_by_cat: dict[str, list[str]] = {}
    missing_high: list[str] = []
    missing_other: list[str] = []

    for key, (label, category) in SMA_PROFILE_FIELDS.items():
        val = all_data.get(key)
        if val is not None and val != "" and val != {}:
            if isinstance(val, dict) and "city" in val:
                display = ", ".join(
                    v for v in [val.get("city"), val.get("state"), val.get("country")]
                    if v
                )
            else:
                display = str(val)
            filled_by_cat.setdefault(category, []).append(f"{label}: {display}")
        else:
            if key in _HIGH_PRIORITY_MISSING:
                missing_high.append(label)
            else:
                missing_other.append(label)

    if any(filled_by_cat.values()):
        lines += ["", "**SMA Profile — Filled fields:**"]
        for cat in ["Basic Information", "Interests & Social Life", "Career",
                     "Background & Education", "Family & Relationships"]:
            if cat in filled_by_cat:
                lines.append(f"  {cat}:")
                for item in filled_by_cat[cat]:
                    lines.append(f"    - {item}")

    if missing_high or missing_other:
        lines += ["", "**Missing fields (PRIORITY — collect these):**"]
        if missing_high:
            lines.append(f"  High priority: {', '.join(missing_high)}")
        if missing_other:
            lines.append(f"  Secondary: {', '.join(missing_other)}")

    pref_filled: list[str] = []
    pref_missing: list[str] = []
    for key, label in SMA_PREFERENCE_FIELDS.items():
        val = sma_prefs.get(key)
        if val is not None and val != "" and val != {}:
            pref_filled.append(f"{label}: {val}")
        else:
            pref_missing.append(label)

    if pref_filled:
        lines += ["", "**Partner Preferences (filled):**"]
        for item in pref_filled:
            lines.append(f"  - {item}")

    if pref_missing:
        lines += ["", "**Partner Preferences (missing):**"]
        lines.append(f"  {', '.join(pref_missing)}")

    if prev_intake:
        extra_intake = []
        sma_keys = set(SMA_PROFILE_FIELDS.keys()) | set(SMA_PREFERENCE_FIELDS.keys())
        for key, label in _INTAKE_LABELS.items():
            if key in sma_keys:
                continue
            val = prev_intake.get(key)
            if val is not None and val != "":
                extra_intake.append(f"{label}: {val}")
        if extra_intake:
            lines += ["", "**Additional data from previous calls:**"]
            lines += extra_intake

    missing_form = member.get("missingFormFields") or []
    has_pending_request = member.get("hasDataRequestPending", False)
    form_label_map = {
        "email": "Email",
        "location": "Location",
        "profilePicture": "Profile Photo",
        "instagram": "Instagram",
        "tiktok": "TikTok",
        "linkedin": "LinkedIn",
    }
    if missing_form:
        missing_labels = [form_label_map.get(f, f) for f in missing_form]
        lines += [
            "",
            "**Profile completion form — missing data:**",
            f"  Missing: {', '.join(missing_labels)}",
        ]
        if has_pending_request:
            lines.append("  (A form link was already sent but not yet filled)")
        lines += [
            "",
            "**Data request instructions:**",
            "- During the call, mention you'll send a link to fill in: "
            + ", ".join(missing_labels) + ".",
            "- Call send_data_request_link() to send the WhatsApp form link.",
            "- Do NOT ask them to verbally spell out email, Instagram, etc.",
        ]
    else:
        lines += [
            "",
            "**Profile completion form:** All form fields are currently filled.",
            "- If they want to update info, call send_data_request_link().",
        ]

    total_fields = len(SMA_PROFILE_FIELDS) + len(SMA_PREFERENCE_FIELDS)
    filled_count = sum(len(vals) for vals in filled_by_cat.values()) + len(pref_filled)
    completeness = filled_count / total_fields if total_fields else 0

    if completeness > 0.7:
        lines[1] = EXISTING_MEMBER_MOSTLY_COMPLETE
    else:
        lines[1] = EXISTING_MEMBER_INCOMPLETE

    if completeness > 0.7:
        lines += [
            "",
            f"**Profile completeness: {int(completeness * 100)}% — mostly filled.**",
            "",
            "**Guidance:**",
            "- Go straight into the profile. Fill remaining gaps naturally.",
            "- VERIFY existing info: confirm key details are still current.",
            "- If something changed, update that field.",
        ]
    else:
        lines += [
            "",
            f"**Profile completeness: {int(completeness * 100)}% — significant gaps remain.**",
            "",
            "**Guidance:**",
            "- Go straight into filling profile gaps.",
            "- Prioritize high-priority missing fields first.",
            "- Also VERIFY existing info is still current.",
        ]

    return "\n".join(lines)


# ── Entrypoint ───────────────────────────────────────────────────────

async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()

    convex = ConvexClient()
    call_handler = CallHandler(convex)

    phone_number: str | None = None
    is_sandbox = False
    call_direction = "inbound"
    call_context: str | None = None
    agent_notes: str | None = None
    logger.info("[entrypoint] Connected to room: %s", ctx.room.name)
    if ctx.job.metadata:
        try:
            meta = json.loads(ctx.job.metadata)
            phone_number = meta.get("phone_number")
            is_sandbox = meta.get("sandbox", False)
            call_direction = meta.get("direction", "inbound")
            call_context = meta.get("context")
            agent_notes = meta.get("agent_notes")
        except (json.JSONDecodeError, AttributeError):
            logger.warning("[entrypoint] Failed to parse dispatch metadata")

    caller_phone = phone_number or call_handler.get_caller_phone(ctx.room)

    sip_call_id = None
    for p in ctx.room.remote_participants.values():
        if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            sip_call_id = p.sid
            if not caller_phone:
                caller_phone = call_handler.get_caller_phone(ctx.room)
            break

    # For outbound calls, wait for callee to answer
    if call_direction == "outbound" and sip_call_id is None:
        logger.info("[entrypoint] Outbound call — waiting for callee to answer...")
        try:
            wait_event = asyncio.Event()

            def on_participant_connected(participant: rtc.RemoteParticipant):
                if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                    wait_event.set()

            ctx.room.on("participant_connected", on_participant_connected)
            try:
                await asyncio.wait_for(wait_event.wait(), timeout=45.0)
            except asyncio.TimeoutError:
                logger.warning("[entrypoint] Outbound call — no answer within 45s")
                await call_handler.on_call_start(
                    room=ctx.room, phone=caller_phone, direction="outbound", lk_api=ctx.api,
                )
                await call_handler.on_call_end(status="no_answer")
                await convex.close()
                get_job_context().shutdown()
                return

            for p in ctx.room.remote_participants.values():
                if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                    sip_call_id = p.sid
                    if not caller_phone:
                        caller_phone = call_handler.get_caller_phone(ctx.room)
                    break
        except Exception as e:
            logger.error("[entrypoint] Error waiting for outbound callee: %s", e)

    await call_handler.on_call_start(
        room=ctx.room,
        sip_call_id=sip_call_id,
        phone=caller_phone,
        direction=call_direction,
        lk_api=ctx.api,
        sandbox=is_sandbox,
    )

    # ── Identity Check: Phone Lookup → Branching Logic ──
    caller_status = "unknown"
    lookup_source = None

    if call_handler.member and call_handler.member.get("_id"):
        caller_status = "existing"
        lookup_source = "local"
    elif caller_phone and call_direction == "inbound":
        try:
            lookup_result = await convex.lookup_phone(caller_phone)
            if lookup_result and lookup_result.get("found"):
                member_data = lookup_result.get("member")
                if member_data:
                    call_handler.member = member_data
                    lookup_source = lookup_result.get("source", "sma")
                    caller_status = "existing"
                else:
                    caller_status = "existing"
                    lookup_source = "sma_partial"
                    call_handler.member = {
                        "firstName": lookup_result.get("firstName", ""),
                        "lastName": lookup_result.get("lastName"),
                        "smaId": lookup_result.get("smaId"),
                    }
            else:
                caller_status = "new"
        except Exception:
            caller_status = "lookup_failed"
    else:
        caller_status = "new" if caller_phone else "unknown"

    # Fetch fresh SMA profile for existing members
    if caller_status == "existing" and call_handler.member and call_handler.member.get("_id"):
        if call_handler.member.get("smaId"):
            try:
                result = await convex.fetch_sma_profile(call_handler.member["_id"])
                if result:
                    call_handler.member["smaProfile"] = result.get("smaProfile", {})
                    call_handler.member["smaPreferences"] = result.get("smaPreferences", {})
                    call_handler.member["clientDetails"] = result.get("clientDetails")
            except Exception:
                cached = call_handler.member.get("smaProfile") or {}
                if cached:
                    prefs = cached.pop("preferences", {}) if isinstance(cached.get("preferences"), dict) else {}
                    call_handler.member["smaProfile"] = cached
                    call_handler.member["smaPreferences"] = prefs

    # Build the agent
    agent = MatchaAgent(convex=convex, call_handler=call_handler)

    # Enrich system prompt based on caller status
    if caller_status == "existing" and call_handler.member:
        agent._instructions += "\n\n" + _build_member_context(call_handler.member)
    elif caller_status == "new":
        agent._instructions += f"\n\n## Caller context\n{NEW_CALLER_COLLECT_EMAIL_CONTEXT}"
    elif caller_status == "lookup_failed":
        agent._instructions += f"\n\n## Caller context\n{LOOKUP_FAILED_CONTEXT}"
    else:
        agent._instructions += f"\n\n## Caller context\n{UNKNOWN_CALLER_CONTEXT}"

    if call_direction == "outbound":
        ctx_key = call_context.split(":")[0].strip() if call_context else "full_intake"
        outbound_ctx = OUTBOUND_CONTEXT.get(ctx_key, OUTBOUND_CONTEXT["full_intake"])
        agent._instructions += f"\n\n## Outbound Call Instructions\n{outbound_ctx}"
        if agent_notes:
            agent._instructions += f"\n\n## Agent Notes (from dashboard)\n{agent_notes}"
        agent._instructions += f"\n\n## If they say it's not a good time\n{OUTBOUND_BAD_TIME_INSTRUCTIONS}"

    if caller_status == "existing" and call_handler.member:
        _raw = call_handler.member.get("firstName", "")
        member_name = "" if _raw in ("", "Unknown") else _raw
        if member_name:
            agent._instructions += (
                f"\n\n## Identity confirmation handling\n"
                f"You believe this caller is **{member_name}** based on their phone number.\n"
                f"Your greeting should confirm this: 'Hey, is this {member_name}?'\n\n"
                f"**If they confirm** (yes, yeah, that's me, etc.):\n"
                f"{IDENTITY_CONFIRMED_CONTEXT.format(name=member_name)}\n\n"
                f"**If they say no / wrong person:**\n"
                f"{IDENTITY_WRONG_NAME_CONTEXT.format(expected_name=member_name)}"
            )

    # ── Create and start the session (LATENCY-CRITICAL CONFIG) ──
    session = AgentSession(
        stt=deepgram.STT(
            model="nova-3",
            language="en",
            smart_format=True,
            filler_words=True,
            keyterm=[
                "Club Allenby", "Dani Bergman", "Matcha",
                "Ashkenazi", "Sephardic", "Mizrachi",
                "Conservadox", "Modern Orthodox",
                "Shabbat", "Shabbos", "kosher",
            ],
        ),
        llm=openai_plugin.LLM(
            model=LLM_MODEL,
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY", ""),
        ),
        tts=cartesia.TTS(
            voice="e07c00bc-4134-4eae-9ea4-1a55fb45746b",
            speed=1.05,
        ),
        vad=silero.VAD.load(
            min_speech_duration=0.1,
            min_silence_duration=0.35,
            activation_threshold=0.6,
        ),
        turn_detection=MultilingualModel(),
        min_endpointing_delay=0.2,
        max_endpointing_delay=1.5,
    )

    call_handler._llm_model = LLM_MODEL

    # ── Guardrail: user-message callback ──
    async def _on_user_message(text: str):
        agent._reset_silence_timer(session)

        if _is_hostile(text):
            agent._hostile_strike_count += 1
            agent._off_topic_count = 0
            if agent._hostile_strike_count >= 2:
                await session.generate_reply(
                    instructions="Caller hostile twice. Transfer to human NOW.",
                )
            elif agent._hostile_strike_count == 1:
                await session.generate_reply(
                    instructions="Caller used hostile language. De-escalate warmly.",
                )
            return

        agent._off_topic_count = 0

    setup_transcript_listeners(session, call_handler, on_user_message=_on_user_message)

    session_closed = asyncio.Event()

    @session.on("close")
    def on_close(*args):
        session_closed.set()

    try:
        await session.start(agent=agent, room=ctx.room)
    except Exception as e:
        logger.error("[entrypoint] session.start() FAILED: %s", e)
        try:
            await call_handler.on_call_end(status="failed")
        except Exception:
            pass
        await convex.close()
        return

    # ── Greeting (adapt based on direction + caller status) ──
    if call_direction == "outbound":
        ctx_key = call_context.split(":")[0].strip() if call_context else "full_intake"
        _raw = call_handler.member.get("firstName", "") if call_handler.member else ""
        member_name = "" if _raw in ("", "Unknown") else _raw
        name_part = f" {member_name}" if member_name else ""
        greeting_template = OUTBOUND_GREETING.get(ctx_key, OUTBOUND_GREETING["full_intake"])
        greeting_text = greeting_template.format(name_part=name_part)
        greeting = f"Outbound call. Greet with: '{greeting_text}' Wait for response."
    elif caller_status == "existing" and call_handler.member:
        _raw = call_handler.member.get("firstName", "")
        member_name = "" if _raw in ("", "Unknown") else _raw
        if member_name:
            greeting = f"Confirm identity: 'Hey! Is this {member_name}?' Wait for response."
        else:
            greeting = "Greet warmly: 'Hey! Thanks for calling Club Allenby, I'm Matcha. Who am I speaking with?'"
    elif caller_status == "new":
        greeting = "New caller. Greet: 'Hey there! I'm Matcha from Club Allenby. What's your name?'"
    elif caller_status == "lookup_failed":
        greeting = "Greet warmly and ask their name to identify them."
    else:
        await session.say(
            "Hey there! This line is for Club Allenby members. "
            "Sign up at club allenby dot com or text Dani directly. Have a great day!",
            allow_interruptions=False,
        )
        await asyncio.sleep(1)
        await call_handler.on_call_end()
        await convex.close()
        get_job_context().shutdown()
        return

    await session.generate_reply(instructions=greeting)

    # Start guardrail timers
    agent._call_start_time = time.time()
    agent._reset_silence_timer(session)
    agent._duration_check_task = asyncio.create_task(
        agent._duration_watchdog(session)
    )

    # Block until session closes
    await session_closed.wait()

    # Cleanup
    agent._cancel_guardrail_timers()
    await call_handler.on_call_end()
    await convex.close()


if __name__ == "__main__":
    agents.cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="matcha-intake-agent",
        )
    )
```

---

### 6.2 `call_handler.py` — Call Lifecycle Management

```python
"""
Call lifecycle management — handles logging, transcript streaming,
audio recording, and post-call processing via Convex.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

from livekit import api, rtc
from livekit.agents import AgentSession

from convex_client import ConvexClient

logger = logging.getLogger("call_handler")


class CallHandler:
    """Manages a single call's lifecycle: start -> transcript streaming -> end.

    Data safety strategy:
    - Call record created immediately on start (survives any crash)
    - Transcript segments streamed to Convex in real-time
    - Audio recorded via LiveKit Egress (server-side, independent of agent process)
    """

    def __init__(self, convex: ConvexClient):
        self._convex = convex
        self.call_id: str | None = None
        self.member: dict[str, Any] | None = None
        self._transcript: list[dict[str, Any]] = []
        self._start_time: float = 0
        self._egress_id: str | None = None
        self._ended: bool = False
        self._llm_model: str | None = None

    async def on_call_start(
        self,
        *,
        room: rtc.Room,
        sip_call_id: str | None = None,
        phone: str | None = None,
        direction: str = "inbound",
        lk_api: api.LiveKitAPI | None = None,
        sandbox: bool = False,
    ) -> dict[str, Any]:
        """Called when a call begins. Logs to Convex, starts audio recording."""
        self._start_time = time.time()

        result: dict[str, Any] = {}
        try:
            result = await self._convex.call_started(
                livekit_room_id=room.name,
                sip_call_id=sip_call_id,
                phone=phone,
                direction=direction,
                sandbox=sandbox,
            )
            self.call_id = result.get("callId")
            self.member = result.get("member")
        except Exception as e:
            logger.warning("Failed to log call start to Convex (non-fatal): %s", e)

        if lk_api and room.name:
            await self._start_recording(lk_api, room.name)

        return result

    async def _start_recording(self, lk_api: api.LiveKitAPI, room_name: str):
        """Start server-side audio recording via LiveKit Egress."""
        try:
            bucket = os.environ.get("RECORDING_S3_BUCKET")
            region = os.environ.get("RECORDING_S3_REGION", "us-east-1")
            access_key = os.environ.get("RECORDING_S3_ACCESS_KEY")
            secret_key = os.environ.get("RECORDING_S3_SECRET_KEY")

            if not bucket or not access_key:
                logger.info("Audio recording skipped — S3 credentials not configured")
                return

            call_id_safe = self.call_id or "unknown"
            timestamp = int(time.time())
            filepath = f"calls/{call_id_safe}/{timestamp}.ogg"

            req = api.RoomCompositeEgressRequest(
                room_name=room_name,
                audio_only=True,
                file_outputs=[
                    api.EncodedFileOutput(
                        file_type=api.EncodedFileType.OGG,
                        filepath=filepath,
                        s3=api.S3Upload(
                            bucket=bucket, region=region,
                            access_key=access_key, secret=secret_key,
                        ),
                    )
                ],
            )

            result = await lk_api.egress.start_room_composite_egress(req)
            self._egress_id = result.egress_id
        except Exception as e:
            logger.warning("Failed to start audio recording (non-fatal): %s", e)

    async def on_transcript_segment(
        self,
        *,
        speaker: str,
        text: str,
        confidence: float | None = None,
    ):
        """Stream a single transcript segment to Convex in real-time."""
        timestamp = time.time()

        self._transcript.append({
            "speaker": speaker,
            "text": text,
            "timestamp": timestamp,
            "confidence": confidence,
        })

        if self.call_id:
            try:
                await self._convex.add_transcript_segment(
                    call_id=self.call_id,
                    speaker=speaker,
                    text=text,
                    timestamp=timestamp,
                    confidence=confidence,
                )
            except Exception as e:
                logger.warning("Failed to stream transcript segment: %s", e)

    async def on_call_end(self, status: str = "completed"):
        """Called when the call ends. Saves final transcript, triggers AI summary."""
        if self._ended:
            return
        self._ended = True

        duration = int(time.time() - self._start_time) if self._start_time else 0

        if self.call_id:
            try:
                await self._convex.call_ended(
                    call_id=self.call_id,
                    duration=duration,
                    transcript=self._transcript,
                    status=status,
                    egress_id=self._egress_id,
                )
            except Exception as e:
                logger.error("Failed to send call-ended to Convex: %s", e)

            await self._log_voice_usage(duration)

    async def _log_voice_usage(self, duration: int):
        """Log STT, LLM, and TTS usage metrics for cost tracking."""
        try:
            user_words = 0
            agent_words = 0
            for seg in self._transcript:
                words = len(seg.get("text", "").split())
                if seg.get("speaker") == "user":
                    user_words += words
                else:
                    agent_words += words

            user_tokens = int(user_words * 1.3)
            agent_tokens = int(agent_words * 1.3)

            await self._convex.log_voice_usage(
                call_id=self.call_id,
                duration_secs=duration,
                stt_model="deepgram/nova-3",
                llm_model=self._llm_model or "openrouter/unknown",
                tts_model="elevenlabs/hA4zGnmTwX2NQiTRMt7o",
                user_tokens=user_tokens,
                agent_tokens=agent_tokens,
                transcript_segments=len(self._transcript),
            )
        except Exception as e:
            logger.warning("Failed to log voice usage (non-fatal): %s", e)

    def get_caller_phone(self, room: rtc.Room) -> str | None:
        """Extract the caller's phone number from SIP participant identity."""
        for p in room.remote_participants.values():
            if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                identity = p.identity
                if identity.startswith("sip:"):
                    identity = identity.split("@")[0].replace("sip:", "")
                elif identity.startswith("sip_"):
                    identity = identity.replace("sip_", "", 1)
                return identity
        return None


def setup_transcript_listeners(
    session: AgentSession,
    call_handler: CallHandler,
    on_user_message=None,
):
    """Wire up AgentSession events to stream transcripts to Convex in real-time."""

    @session.on("conversation_item_added")
    def on_conversation_item(ev):
        item = ev.item
        if item.role not in ("user", "assistant"):
            return
        text = item.text_content
        if not text:
            return
        speaker = "caller" if item.role == "user" else "agent"
        asyncio.create_task(
            call_handler.on_transcript_segment(speaker=speaker, text=text)
        )
        if speaker == "caller" and on_user_message:
            asyncio.create_task(on_user_message(text))
```

---

### 6.3 `convex_client.py` — Backend HTTP Client

```python
"""
HTTP client for calling Convex backend from the Python voice agent.
All Convex interaction goes through HTTP endpoints defined in convex/voice/http.ts.
"""

import os
import httpx
from typing import Any


class ConvexClient:
    """Async HTTP client for the Convex voice API endpoints."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or os.environ["CONVEX_URL"]).rstrip("/")
        self._client = httpx.AsyncClient(timeout=30.0)

    async def _post(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        resp = await self._client.post(url, json=data)
        resp.raise_for_status()
        return resp.json()

    async def call_started(self, *, livekit_room_id: str, sip_call_id: str | None = None,
                           phone: str | None = None, direction: str = "inbound",
                           sandbox: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "livekitRoomId": livekit_room_id, "sipCallId": sip_call_id,
            "phone": phone, "direction": direction,
        }
        if sandbox:
            payload["sandbox"] = True
        return await self._post("/voice/call-started", payload)

    async def call_ended(self, *, call_id: str, duration: int,
                         transcript: list[dict[str, Any]], status: str = "completed",
                         egress_id: str | None = None) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "callId": call_id, "duration": duration,
            "transcript": transcript, "status": status,
        }
        if egress_id:
            payload["egressId"] = egress_id
        return await self._post("/voice/call-ended", payload)

    async def add_transcript_segment(self, *, call_id: str, speaker: str, text: str,
                                     timestamp: float, confidence: float | None = None) -> dict[str, Any]:
        return await self._post("/voice/transcript-segment", {
            "callId": call_id, "speaker": speaker, "text": text,
            "timestamp": timestamp, "confidence": confidence,
        })

    async def lookup_phone(self, phone: str) -> dict[str, Any] | None:
        try:
            result = await self._post("/voice/lookup-phone", {"phone": phone})
            if result.get("found"):
                return result
            return None
        except Exception:
            return None

    async def fetch_sma_profile(self, member_id: str) -> dict[str, Any] | None:
        return await self._post("/voice/fetch-sma-profile", {"memberId": member_id})

    async def send_data_request(self, *, member_id: str) -> dict[str, Any]:
        return await self._post("/voice/send-data-request", {"memberId": member_id})

    async def save_intake_data(self, *, call_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/voice/save-intake-data", {"callId": call_id, "data": data})

    async def save_deep_dive_data(self, *, call_id: str, data: dict[str, Any]) -> dict[str, Any]:
        return await self._post("/voice/save-deep-dive", {"callId": call_id, "data": data})

    async def log_voice_usage(self, *, call_id: str, duration_secs: int, stt_model: str,
                              llm_model: str, tts_model: str, user_tokens: int,
                              agent_tokens: int, transcript_segments: int) -> dict[str, Any]:
        return await self._post("/voice/log-usage", {
            "callId": call_id, "durationSecs": duration_secs,
            "sttModel": stt_model, "llmModel": llm_model, "ttsModel": tts_model,
            "userTokens": user_tokens, "agentTokens": agent_tokens,
            "transcriptSegments": transcript_segments,
        })

    async def close(self):
        await self._client.aclose()
```

---

### 6.4 `persona.py` — System Prompt & LLM Model Config

```python
"""
Agent Matcha voice persona — system prompt and conversation configuration
for the Club Allenby intake agent.
"""

# The full system prompt is 462 lines covering:
# - Persona (warm, casual friend — not a bot)
# - Conversation pacing rules (ONE question at a time, react before asking)
# - Intake structure (greeting → opening question → deep dive → wrap-up)
# - Cultural fluency (Jewish observance spectrum, kosher levels, etc.)
# - Guardrails (hostile language, off-topic, silence, time management)
# - Two-phase structure (Phase 1: CRM intake, Phase 2: deep dive personal)
# - Data handling rules

# OpenRouter model for the conversation LLM
LLM_MODEL = "google/gemini-3.1-flash-lite-preview"
```

*(Full system prompt is 462 lines — included in the SYSTEM_PROMPT variable. See persona.py for complete text.)*

---

### 6.5 `flows/intake.py` — Conversation Flow Contexts

```python
"""
Intake conversation flow configuration.
Stages are guidance for the LLM — not rigid states.
"""

STAGES = {
    "greeting": {
        "description": "Warm greeting and housekeeping",
        "next": "opening_question",
    },
    "opening_question": {
        "description": "The big bundled opener to get them talking",
        "next": "deep_dive",
    },
    "deep_dive": {
        "description": "Natural conversation covering background, Judaism, career, dating, preferences",
        "next": "wrap_up",
    },
    "wrap_up": {
        "description": "Final check, send form link if needed, and goodbye",
        "next": None,
    },
}

# Context blocks for different caller types:
# - EXISTING_MEMBER_MOSTLY_COMPLETE (>70% profile filled)
# - EXISTING_MEMBER_INCOMPLETE (significant gaps)
# - UNKNOWN_CALLER_CONTEXT (not a member → redirect)
# - NEW_CALLER_COLLECT_EMAIL_CONTEXT (new caller → full intake)
# - LOOKUP_FAILED_CONTEXT (technical fallback)
# - OUTBOUND_GREETING (full_intake, profile_update, follow_up)
# - OUTBOUND_CONTEXT (full_intake, profile_update, follow_up)
# - OUTBOUND_BAD_TIME_INSTRUCTIONS
# - IDENTITY_CONFIRMED_CONTEXT / IDENTITY_WRONG_NAME_CONTEXT
```

*(See flows/intake.py for full context block strings.)*

---

## 7. Dependencies & Deployment

### `pyproject.toml`

```toml
[project]
name = "agent-matcha-voice"
version = "0.1.0"
description = "Club Allenby voice intake agent powered by LiveKit"
requires-python = ">=3.11"
dependencies = [
    "livekit-agents>=1.2.0",
    "livekit-plugins-deepgram>=1.2.0",
    "livekit-plugins-cartesia>=1.2.0",
    "livekit-plugins-openai>=1.2.0",
    "livekit-plugins-silero>=1.2.0",
    "livekit-plugins-noise-cancellation>=0.2.0",
    "livekit-plugins-turn-detector>=1.0.0",
    "httpx>=0.27.0",
    "python-dotenv>=1.0.0",
]

[project.scripts]
agent = "agent:main"

[build-system]
requires = ["setuptools>=75.0"]
build-backend = "setuptools.build_meta"
```

### `Dockerfile`

```dockerfile
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        gcc \
        libffi-dev \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

ENTRYPOINT ["python", "agent.py"]
CMD ["start"]
```

### `livekit.toml` (deployment config)

```toml
[project]
  subdomain = "agent-matcha-epj9rku0"

[agent]
  id = "CA_eKxv5Y6cVocp"
# Deployed 2026-03-19T10:01:21Z
```

### `.env.example`

```bash
# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# OpenRouter (LLM) — OpenAI-compatible API
OPENROUTER_API_KEY=

# Cartesia (TTS)
CARTESIA_API_KEY=

# Deepgram (STT + TTS)
DEEPGRAM_API_KEY=

# Convex (for Python agent HTTP calls)
CONVEX_URL=https://your-deployment.convex.cloud

# Twilio (SIP trunk)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_SIP_TRUNK_SID=
TWILIO_PHONE_NUMBER=

# Outbound calling
# LIVEKIT_OUTBOUND_TRUNK_ID=

# Live transfer phone numbers (E.164 format)
DANI_PHONE=
JANE_PHONE=

# Audio recording (optional — S3-compatible storage)
# RECORDING_S3_BUCKET=
# RECORDING_S3_REGION=us-east-1
# RECORDING_S3_ACCESS_KEY=
# RECORDING_S3_SECRET_KEY=
```

### Deploy command

```bash
lk agent deploy --region us-east
```

---

## 8. Known Bottlenecks & Research Areas

### High-Impact Optimization Opportunities

#### 1. LLM Provider Routing (est. -300-1000ms)
**Current:** Agent → OpenRouter → Google Gemini API (double network hop)
**Research areas:**
- Direct Google Gemini API integration (eliminate OpenRouter proxy hop)
- Measure OpenRouter routing overhead vs. direct API TTFB
- Evaluate alternative fast LLMs: Groq (Llama), Cerebras, Fireworks
- Consider edge-deployed / self-hosted small models for simple responses
- Test `preemptive_generation` with non-Gemini models (was disabled due to Gemini bugs)

#### 2. System Prompt Size (est. -100-500ms LLM TTFB)
**Current:** The system prompt is very large (~462 lines of persona + dynamically injected member context, missing fields, preferences, etc.)
**Research areas:**
- Measure TTFB impact of prompt length on Gemini Flash Lite
- Compress/summarize the system prompt — move verbose instructions to a retrieval layer
- Separate "always needed" instructions from "contextual" instructions
- Profile the token count of the full system prompt for typical calls

#### 3. Endpointing & Turn Detection (est. -100-500ms)
**Current:** `min_endpointing_delay=200ms`, `max_endpointing_delay=1500ms`, Multilingual turn detector
**Research areas:**
- Can `min_endpointing_delay` go lower (100ms)? What's the false-positive rate?
- Can `max_endpointing_delay` be reduced to 1000ms?
- Is the Multilingual turn detector adding unnecessary latency for English-only calls?
- Test the English-only turn detector model
- Measure actual turn detector inference time

#### 4. VAD Tuning (est. -50-200ms)
**Current:** Silero VAD with `min_silence_duration=350ms`
**Research areas:**
- Can `min_silence_duration` go to 250ms without false speech-end detection?
- Is `activation_threshold=0.6` causing false positives that create unnecessary STT/LLM cycles?
- Measure the actual silence duration distribution in real calls

#### 5. TTS Optimization (est. -50-200ms)
**Current:** Cartesia at speed 1.05
**Research areas:**
- Measure Cartesia first-chunk latency vs. alternatives (ElevenLabs Turbo, Deepgram TTS)
- Test higher speed values (1.1, 1.15) — what's the perception threshold?
- Evaluate streaming chunk size impact on perceived latency
- Consider TTS warm-up / keep-alive to avoid cold-start latency

#### 6. Network & Infrastructure (est. -50-150ms)
**Research areas:**
- LiveKit Cloud region selection (currently `us-east`) — measure latency to each provider from that region
- Deepgram, OpenRouter, Cartesia — are they all in us-east?
- SIP → WebRTC transcoding latency in LiveKit's SIP gateway
- Connection pooling / keep-alive for Convex HTTP calls (currently httpx with 30s timeout)

#### 7. Conversation Design (perceived latency)
**Research areas:**
- Backchannel/filler responses ("mmhmm", "yeah") while the LLM is thinking
- Pre-compute likely next responses during user speech
- Interrupt-and-restart: begin responding before turn detection confirms, retract if user continues
- Reduce response length: shorter LLM responses = faster TTS = faster perceived response

### Metrics to Collect

For proper optimization, instrument:
1. **VAD end-of-speech timestamp** — when Silero declares silence
2. **Turn detector decision timestamp** — when it confirms end-of-turn
3. **STT final transcript timestamp** — when Deepgram finalizes
4. **LLM first token timestamp** — time to first token from OpenRouter
5. **LLM last token timestamp** — total generation time
6. **TTS first audio chunk timestamp** — when Cartesia starts streaming
7. **Audio playback start timestamp** — when the user actually hears the response

Calculating deltas between these gives the exact per-stage breakdown for each turn.

---

## File Structure Summary

```
voice-agent/
├── agent.py              # 1555 lines — Main agent, tools, guardrails, entrypoint
├── call_handler.py       # 288 lines  — Call lifecycle, transcript streaming, recording
├── convex_client.py      # 167 lines  — HTTP client for Convex backend
├── persona.py            # 592 lines  — System prompt, Phase 2 addendum, LLM model
├── flows/
│   ├── __init__.py
│   └── intake.py         # 221 lines  — Flow stages, caller type contexts
├── sip_config.py         # 167 lines  — SIP trunk setup script
├── tools.py              # 11 lines   — Tool reference (tools defined in agent.py)
├── pyproject.toml        # Dependencies
├── livekit.toml          # LiveKit Cloud deployment config
├── Dockerfile            # Container build
├── .env.example          # Environment variable template
└── .env                  # Live credentials (not committed)
```

---

*Generated 2026-03-19 for latency optimization research.*
