"""LLM function tool definitions and handlers for the Matcha voice agent.

Defines 7 tools in OpenAI function-calling schema (accepted by Pipecat's
GoogleLLMService) and registers async handlers on the LLM service.

Tools:
    save_intake_data      — Save 50+ CRM intake fields after Phase 1
    send_data_request_link — Send profile completion form via WhatsApp
    transfer_call         — SIP transfer to Dani/Jane (stub in local mode)
    end_call              — Graceful call termination
    start_deep_dive       — Activate Phase 2 deep-dive instructions
    save_deep_dive_data   — Save matchmaker note + personality tags
    transfer_to_human     — Escalation transfer (stub in local mode)
"""

import asyncio
import logging
from typing import Any

from pipecat.frames.frames import EndFrame
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.services.llm_service import FunctionCallParams

from persona import PHASE_2_DEEP_DIVE_ADDENDUM

logger = logging.getLogger("tools")


# ═══════════════════════════════════════════════════════════════════════════
# Tool Definitions — OpenAI function-calling schema
# ═══════════════════════════════════════════════════════════════════════════

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    # ── 1. save_intake_data ───────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "save_intake_data",
            "description": (
                "Save NEW profile information gathered during THIS intake call. "
                "Call this ONCE at the end of the conversation after saying goodbye. "
                "CRITICAL: Only save information the caller EXPLICITLY told you during "
                "THIS conversation. Do NOT save data from the pre-loaded caller context "
                "or SMA profile — that data already exists in the CRM. If the call was "
                "very short and the caller barely said anything, call this with NO fields "
                "or skip calling it entirely."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "first_name": {"type": "string", "description": "The caller's first name."},
                    "last_name": {"type": "string", "description": "The caller's last name."},
                    "age": {"type": "integer", "description": "The caller's age."},
                    "location": {"type": "string", "description": "Where the caller currently lives."},
                    "hometown": {"type": "string", "description": "Where the caller grew up or is originally from."},
                    "willing_to_relocate": {"type": "boolean", "description": "Whether they'd relocate or date long distance."},
                    "ethnicity": {"type": "string", "description": "Jewish ethnic background (Ashkenazi, Sephardic, Persian, Israeli, etc.)."},
                    "occupation": {"type": "string", "description": "What the caller does for work."},
                    "family_info": {"type": "string", "description": "Family details — siblings, parents, closeness, marital status of siblings."},
                    "jewish_observance": {"type": "string", "description": "Level of observance (Reform, Conservative, Orthodox, Traditional, secular, etc.)."},
                    "kosher_level": {"type": "string", "description": "Kosher details (not kosher, kosher-style, kosher meat only, kosher in/out, fully kosher)."},
                    "shabbat_observance": {"type": "string", "description": "How they observe Shabbat (Friday dinners, full observance, not at all, etc.)."},
                    "relationship_history": {"type": "string", "description": "Previous relationships, what happened, patterns noticed, lessons learned."},
                    "looking_for": {"type": "string", "description": "Description of their ideal partner — personality, values, lifestyle."},
                    "physical_preferences": {"type": "string", "description": "Physical type preferences (height, build, look, etc.)."},
                    "age_range_preference": {"type": "string", "description": "Age range they are willing to date."},
                    "must_haves": {"type": "string", "description": "Things they absolutely need in a partner."},
                    "dealbreakers": {"type": "string", "description": "Absolute deal breakers."},
                    "marriage_timeline": {"type": "string", "description": "When they want to get married."},
                    "kids_preference": {"type": "string", "description": "Whether they want kids, how many, when."},
                    "day_in_life": {"type": "string", "description": "What a typical day looks like for them."},
                    "hobbies": {"type": "string", "description": "Interests, hobbies, fitness habits."},
                    "additional_notes": {"type": "string", "description": "Anything else noteworthy from the conversation."},
                    # New expanded fields
                    "height": {"type": "string", "description": "Height (e.g. \"5'10\", \"178cm\")."},
                    "hair_color": {"type": "string", "description": "Hair color."},
                    "eye_color": {"type": "string", "description": "Eye color."},
                    "smoke": {"type": "string", "description": "Smoking habits."},
                    "drink_alcohol": {"type": "string", "description": "Drinking habits."},
                    "pets": {"type": "string", "description": "Whether they have pets and what kind."},
                    "languages": {"type": "string", "description": "Languages spoken."},
                    "political_affiliation": {"type": "string", "description": "Political leaning or affiliation."},
                    "education_level": {"type": "string", "description": "Highest education level."},
                    "college_details": {"type": "string", "description": "College/university details."},
                    "weekend_preferences": {"type": "string", "description": "How they spend weekends."},
                    "friends_describe": {"type": "string", "description": "How their friends would describe them."},
                    "organizations": {"type": "string", "description": "Organizations or communities they belong to."},
                    "personal_growth": {"type": "string", "description": "Personal growth interests or journey."},
                    "what_you_notice": {"type": "string", "description": "What they first notice in a person."},
                    "instagram": {"type": "string", "description": "Instagram handle."},
                    "children_details": {"type": "string", "description": "Details about their children."},
                    "long_distance": {"type": "string", "description": "Willingness for long distance (yes/no/maybe)."},
                    "nationality": {"type": "string", "description": "Nationality or cultural background."},
                    "sexual_orientation": {"type": "string", "description": "Sexual orientation."},
                    "birthdate": {"type": "string", "description": "Date of birth (YYYY-MM-DD if possible)."},
                    "career_overview": {"type": "string", "description": "Career overview and trajectory."},
                    "relationship_status": {"type": "string", "description": "Current relationship status."},
                    "income": {"type": "string", "description": "Income level or range."},
                    "upbringing": {"type": "string", "description": "Upbringing and family values background."},
                    # Partner preference fields
                    "pref_seeking": {"type": "string", "description": "Gender they're seeking (male/female/non-binary)."},
                    "pref_sexual_orientation": {"type": "string", "description": "Preferred sexual orientation of partner."},
                    "pref_relationship_status": {"type": "string", "description": "Preferred relationship status of partner."},
                    "pref_ethnicity": {"type": "string", "description": "Preferred ethnicity of partner."},
                    "pref_religion": {"type": "string", "description": "Preferred religion of partner."},
                    "pref_education": {"type": "string", "description": "Preferred education level of partner."},
                    "pref_income": {"type": "string", "description": "Preferred income level of partner."},
                    "pref_height_range": {"type": "string", "description": "Preferred height range (e.g. \"5'4-6'0\")."},
                    "pref_hair_color": {"type": "string", "description": "Preferred hair color of partner."},
                    "pref_eye_color": {"type": "string", "description": "Preferred eye color of partner."},
                    "pref_political": {"type": "string", "description": "Preferred political affiliation of partner."},
                    "pref_smoking": {"type": "string", "description": "Would they date a smoker (yes socially/yes regularly/no)."},
                    "pref_drinking": {"type": "string", "description": "Would they date a drinker (yes socially/yes regularly/no)."},
                    "pref_children": {"type": "string", "description": "Would they date someone with children (no/yes not impacting/shared custody/dependent)."},
                    "pref_relocating": {"type": "string", "description": "Open to relocating (yes/no/maybe)."},
                    "pref_partner_values": {"type": "string", "description": "Top values they want in partner (e.g. trust, respect, communication)."},
                    "pref_partner_interests": {"type": "string", "description": "Interests they want in partner (e.g. travel, hiking, dining out)."},
                    # Membership interest
                    "membership_interest": {"type": "string", "description": "If the caller expressed interest in a paid tier — \"member\" for Membership or \"vip\" for VIP Matchmaking. Only set if they clearly expressed interest."},
                },
                "required": [],
            },
        },
    },

    # ── 2. send_data_request_link ─────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "send_data_request_link",
            "description": (
                "Send a profile completion form link to the member via WhatsApp. "
                "Call this when the member has missing profile data (photo, email, "
                "Instagram, TikTok, LinkedIn, location) OR when they want to UPDATE "
                "any of that data (change their photo, update Instagram, etc.). "
                "The link will be sent to their WhatsApp immediately. "
                "Tell them: 'I just sent you a link on WhatsApp — you can fill in "
                "your details there whenever you get a chance.'"
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },

    # ── 3. transfer_call ──────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "transfer_call",
            "description": (
                "Transfer the call to a real person (warm transfer via SIP). "
                "Use this when the caller asks to speak with a real person, or when "
                "you need to escalate."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "transfer_to": {
                        "type": "string",
                        "description": (
                            "Who to transfer to. Use \"dani\" for Dani Bergman "
                            "or \"jane\" for Jane. These map to their phone numbers."
                        ),
                    },
                },
                "required": ["transfer_to"],
            },
        },
    },

    # ── 4. end_call ───────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "end_call",
            "description": (
                "End the conversation. Call this after you've said goodbye and "
                "after you've called save_intake_data with the collected information."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },

    # ── 5. start_deep_dive ────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "start_deep_dive",
            "description": (
                "Activate Phase 2 — the deep dive personal conversation. "
                "Call this AFTER you have called save_intake_data with the CRM data. "
                "This shifts your instructions to focus on deeper, personal questions "
                "that help matchmakers truly understand who this person is. "
                "After calling this, transition naturally into the deeper conversation."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },

    # ── 6. save_deep_dive_data ────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "save_deep_dive_data",
            "description": (
                "Save the deep dive insights from Phase 2 of the conversation. "
                "Call this at the end of Phase 2, before ending the call."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "matchmaker_note": {
                        "type": "string",
                        "description": (
                            "A rich, free-form paragraph written as a matchmaker's "
                            "internal note. Summarize who this person really is — their emotional "
                            "patterns, what drives them, what they need in a partner, their life "
                            "stage, key personality traits. Include specific observations and "
                            "quotes from the conversation. This is the most important field."
                        ),
                    },
                    "attachment_style": {
                        "type": "string",
                        "description": (
                            "Their attachment/relationship style (e.g. \"secure\", "
                            "\"anxious-leaning\", \"avoidant but working on it\", \"secure-leaning, "
                            "communicative\")."
                        ),
                    },
                    "communication_style": {
                        "type": "string",
                        "description": (
                            "How they communicate (e.g. \"direct and honest\", "
                            "\"conflict-avoidant\", \"emotionally expressive\", \"reserved but "
                            "thoughtful\")."
                        ),
                    },
                    "energy_level": {
                        "type": "string",
                        "description": (
                            "Their energy and activity level (e.g. \"high energy, "
                            "always on the go\", \"balanced — adventurous but needs downtime\", "
                            "\"homebody who enjoys quiet evenings\")."
                        ),
                    },
                    "life_stage": {
                        "type": "string",
                        "description": (
                            "Where they are in life right now (e.g. \"career building "
                            "phase\", \"personal reinvention after breakup\", \"settled and ready "
                            "for family\", \"exploring and figuring things out\")."
                        ),
                    },
                    "emotional_maturity": {
                        "type": "string",
                        "description": (
                            "Level of self-awareness and emotional growth "
                            "(e.g. \"high self-awareness, has done therapy\", \"growing — learning "
                            "from past mistakes\", \"emotionally guarded but opening up\")."
                        ),
                    },
                    "social_style": {
                        "type": "string",
                        "description": (
                            "How they engage socially (e.g. \"extroverted, large "
                            "friend group\", \"introverted extrovert — social but recharges "
                            "alone\", \"small tight-knit circle\")."
                        ),
                    },
                    "love_language": {
                        "type": "string",
                        "description": (
                            "How they give and receive love (e.g. \"quality time "
                            "and words of affirmation\", \"acts of service\", \"physical touch "
                            "and shared experiences\")."
                        ),
                    },
                    "conflict_style": {
                        "type": "string",
                        "description": (
                            "How they handle disagreements (e.g. \"communicative, "
                            "addresses issues directly\", \"avoids conflict, needs space first\", "
                            "\"passionate but fair\")."
                        ),
                    },
                    "conversation_summary": {
                        "type": "string",
                        "description": (
                            "A detailed summary of what was discussed in Phase 2. "
                            "Include key topics covered, notable stories they shared, "
                            "and any revealing quotes. This gives the matchmaker the raw "
                            "context behind the matchmaker_note."
                        ),
                    },
                },
                "required": ["matchmaker_note"],
            },
        },
    },

    # ── 7. transfer_to_human ──────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "transfer_to_human",
            "description": (
                "Transfer the caller to a human team member. Call this when the "
                "caller is hostile or explicitly requests to speak with a person. "
                "Say 'Let me connect you with a team member' first, then call this."
            ),
            "parameters": {
                "type": "object",
                "properties": {},
                "required": [],
            },
        },
    },
]


# ═══════════════════════════════════════════════════════════════════════════
# snake_case → camelCase mapping for save_intake_data
# ═══════════════════════════════════════════════════════════════════════════

# Maps each snake_case parameter name to its camelCase key in the Convex API.
# Order and names are identical to the LiveKit agent's data mapping.
_INTAKE_FIELD_MAP: list[tuple[str, str]] = [
    ("first_name", "firstName"),
    ("last_name", "lastName"),
    ("age", "age"),
    ("location", "location"),
    ("hometown", "hometown"),
    ("willing_to_relocate", "willingToRelocate"),
    ("ethnicity", "ethnicity"),
    ("occupation", "occupation"),
    ("family_info", "familyInfo"),
    ("jewish_observance", "jewishObservance"),
    ("kosher_level", "kosherLevel"),
    ("shabbat_observance", "shabbatObservance"),
    ("relationship_history", "relationshipHistory"),
    ("looking_for", "lookingFor"),
    ("physical_preferences", "physicalPreferences"),
    ("age_range_preference", "ageRangePreference"),
    ("must_haves", "mustHaves"),
    ("dealbreakers", "dealbreakers"),
    ("marriage_timeline", "marriageTimeline"),
    ("kids_preference", "kidsPreference"),
    ("day_in_life", "dayInLife"),
    ("hobbies", "hobbies"),
    ("additional_notes", "additionalNotes"),
    # New expanded fields
    ("height", "height"),
    ("hair_color", "hairColor"),
    ("eye_color", "eyeColor"),
    ("smoke", "smoke"),
    ("drink_alcohol", "drinkAlcohol"),
    ("pets", "hasPets"),
    ("languages", "languages"),
    ("political_affiliation", "politicalAffiliation"),
    ("education_level", "educationLevel"),
    ("college_details", "collegeDetails"),
    ("weekend_preferences", "weekendPreferences"),
    ("friends_describe", "friendsDescribe"),
    ("organizations", "organizations"),
    ("personal_growth", "personalGrowth"),
    ("what_you_notice", "whatYouNotice"),
    ("instagram", "instagram"),
    ("children_details", "childrenDetails"),
    ("long_distance", "longDistance"),
    ("nationality", "nationality"),
    ("sexual_orientation", "sexualOrientation"),
    ("birthdate", "birthdate"),
    ("career_overview", "careerOverview"),
    ("relationship_status", "relationshipStatus"),
    ("income", "income"),
    ("upbringing", "upbringing"),
    # Partner preference fields
    ("pref_seeking", "prefSeeking"),
    ("pref_sexual_orientation", "prefSexualOrientation"),
    ("pref_relationship_status", "prefRelationshipStatus"),
    ("pref_ethnicity", "prefEthnicity"),
    ("pref_religion", "prefReligion"),
    ("pref_education", "prefEducation"),
    ("pref_income", "prefIncome"),
    ("pref_height_range", "prefHeightRange"),
    ("pref_hair_color", "prefHairColor"),
    ("pref_eye_color", "prefEyeColor"),
    ("pref_political", "prefPolitical"),
    ("pref_smoking", "prefSmoking"),
    ("pref_drinking", "prefDrinking"),
    ("pref_children", "prefChildren"),
    ("pref_relocating", "prefRelocating"),
    ("pref_partner_values", "prefPartnerValues"),
    ("pref_partner_interests", "prefPartnerInterests"),
    # Membership interest
    ("membership_interest", "membershipInterest"),
]


# ═══════════════════════════════════════════════════════════════════════════
# Tool Registration — wires up handlers on the LLM service
# ═══════════════════════════════════════════════════════════════════════════

def register_tools(llm, agent_state: dict[str, Any]) -> None:
    """Register all 7 function tool handlers on the LLM service.

    Args:
        llm: The GoogleLLMService instance.
        agent_state: Shared mutable state dict with keys:
            - "convex": ConvexClient instance
            - "call_id": str | None — current call ID
            - "member": dict | None — member data from Convex
            - "phase2_active": bool — whether Phase 2 is active
            - "task": PipelineTask — for queueing EndFrame
            - "context": OpenAILLMContext — for appending Phase 2 instructions
            - "cancel_guardrails": callable — cancels guardrail timers
    """

    # ── 1. save_intake_data ───────────────────────────────────────────────

    async def handle_save_intake_data(params: FunctionCallParams):
        args = params.arguments
        call_id = agent_state.get("call_id")
        if not call_id:
            await params.result_callback({"saved": False, "reason": "no active call"})
            return

        # Build camelCase data dict from snake_case args
        data: dict[str, Any] = {}
        for snake_key, camel_key in _INTAKE_FIELD_MAP:
            val = args.get(snake_key)
            if val is not None:
                data[camel_key] = val

        if not data:
            logger.info("[save_intake_data] No data provided — skipping save")
            await params.result_callback({"saved": False, "reason": "no data provided"})
            return

        logger.info(
            "[save_intake_data] Saving %d fields: %s",
            len(data),
            list(data.keys()),
        )
        convex = agent_state["convex"]
        await convex.save_intake_data(call_id=call_id, data=data)
        logger.info("[save_intake_data] Successfully saved to Convex")
        await params.result_callback({"saved": True})

    llm.register_function("save_intake_data", handle_save_intake_data)

    # ── 2. send_data_request_link ─────────────────────────────────────────

    async def handle_send_data_request_link(params: FunctionCallParams):
        member = agent_state.get("member")
        if not member or not member.get("_id"):
            await params.result_callback({"sent": False, "reason": "no member found"})
            return

        logger.info(
            "[send_data_request_link] Sending form to member %s",
            member.get("firstName"),
        )
        convex = agent_state["convex"]
        result = await convex.send_data_request(member_id=member["_id"])
        if result.get("alreadyPending"):
            logger.info("[send_data_request_link] Already had a pending request — resent")
            await params.result_callback({"sent": True, "note": "A form link was already pending — resent it"})
            return
        logger.info("[send_data_request_link] New form link created and sent")
        await params.result_callback({"sent": True})

    llm.register_function("send_data_request_link", handle_send_data_request_link)

    # ── 3. transfer_call ──────────────────────────────────────────────────
    # Stub for local/WebRTC mode — no SIP transfer available.

    async def handle_transfer_call(params: FunctionCallParams):
        transfer_to = params.arguments.get("transfer_to", "unknown")
        logger.info(
            "[transfer_call] Transfer requested to '%s' — no SIP in local mode, ending call",
            transfer_to,
        )

        # Cancel guardrails and end gracefully
        cancel_fn = agent_state.get("cancel_guardrails")
        if cancel_fn:
            cancel_fn()

        await params.result_callback(
            f"Transfer to {transfer_to} is not available in local mode. Ending call."
        )

        # Wait for TTS to finish, then end
        await asyncio.sleep(2)

        convex = agent_state["convex"]
        call_id = agent_state.get("call_id")
        if call_id:
            try:
                await convex.call_ended(
                    call_id=call_id,
                    duration=0,
                    transcript=[],
                    status="transferred",
                )
            except Exception as e:
                logger.error("[transfer_call] Failed to notify Convex: %s", e)

        task = agent_state.get("task")
        if task:
            await task.queue_frame(EndFrame())

    llm.register_function("transfer_call", handle_transfer_call)

    # ── 4. end_call ───────────────────────────────────────────────────────

    async def handle_end_call(params: FunctionCallParams):
        logger.info("[end_call] Agent initiating call end — waiting 3s for goodbye audio")

        # Cancel guardrail timers
        cancel_fn = agent_state.get("cancel_guardrails")
        if cancel_fn:
            cancel_fn()

        await params.result_callback("Call ended.")

        # Wait for goodbye audio to play through TTS
        await asyncio.sleep(3)

        # Notify Convex
        convex = agent_state["convex"]
        call_id = agent_state.get("call_id")
        if call_id:
            logger.info("[end_call] Sending call-ended to Convex before shutdown")
            try:
                await convex.call_ended(
                    call_id=call_id,
                    duration=0,
                    transcript=[],
                    status="completed",
                )
            except Exception as e:
                logger.error("[end_call] Failed to notify Convex: %s", e)

        # Queue EndFrame to stop the pipeline
        logger.info("[end_call] Queueing EndFrame")
        task = agent_state.get("task")
        if task:
            await task.queue_frame(EndFrame())

    llm.register_function("end_call", handle_end_call)

    # ── 5. start_deep_dive ────────────────────────────────────────────────

    async def handle_start_deep_dive(params: FunctionCallParams):
        if agent_state.get("phase2_active"):
            await params.result_callback("Phase 2 is already active.")
            return

        agent_state["phase2_active"] = True

        # Append Phase 2 instructions to the system message in the LLM context
        context: OpenAILLMContext = agent_state["context"]
        messages = context.get_messages()
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] += PHASE_2_DEEP_DIVE_ADDENDUM
        else:
            # Fallback: prepend a new system message with the addendum
            messages.insert(0, {"role": "system", "content": PHASE_2_DEEP_DIVE_ADDENDUM})
        context.set_messages(messages)

        logger.info("[start_deep_dive] Phase 2 activated — deep dive instructions injected")

        # Mark Phase 2 started on the call record
        call_id = agent_state.get("call_id")
        if call_id:
            try:
                convex = agent_state["convex"]
                await convex.save_intake_data(
                    call_id=call_id, data={"phase2Started": True}
                )
            except Exception:
                pass  # Non-critical — fallback detection still works

        await params.result_callback(
            "Phase 2 activated. Transition naturally into the deeper conversation."
        )

    llm.register_function("start_deep_dive", handle_start_deep_dive)

    # ── 6. save_deep_dive_data ────────────────────────────────────────────

    async def handle_save_deep_dive_data(params: FunctionCallParams):
        args = params.arguments
        call_id = agent_state.get("call_id")
        if not call_id:
            await params.result_callback({"saved": False, "reason": "no active call"})
            return

        matchmaker_note = args.get("matchmaker_note", "")
        if not matchmaker_note:
            await params.result_callback({"saved": False, "reason": "matchmaker_note is required"})
            return

        # Build tags dict from personality signal fields
        tags: dict[str, str] = {}
        for tag_key in [
            "attachment_style",
            "communication_style",
            "energy_level",
            "life_stage",
            "emotional_maturity",
            "social_style",
            "love_language",
            "conflict_style",
        ]:
            val = args.get(tag_key)
            if val is not None:
                tags[tag_key] = val

        conversation_summary = args.get("conversation_summary", "")

        data = {
            "matchmakerNote": matchmaker_note,
            "tags": tags,
            "conversationSummary": conversation_summary,
        }

        logger.info(
            "[save_deep_dive_data] Saving deep dive: note=%d chars, %d tags, summary=%d chars",
            len(matchmaker_note),
            len(tags),
            len(conversation_summary),
        )
        convex = agent_state["convex"]
        await convex.save_deep_dive_data(call_id=call_id, data=data)
        logger.info("[save_deep_dive_data] Successfully saved to Convex")
        await params.result_callback({"saved": True})

    llm.register_function("save_deep_dive_data", handle_save_deep_dive_data)

    # ── 7. transfer_to_human ──────────────────────────────────────────────
    # Stub for local/WebRTC mode — no SIP transfer available.

    async def handle_transfer_to_human(params: FunctionCallParams):
        logger.info("[transfer_to_human] Transferring caller to human — saving data first")

        # Cancel guardrails
        cancel_fn = agent_state.get("cancel_guardrails")
        if cancel_fn:
            cancel_fn()

        await params.result_callback("Call transferred.")

        await asyncio.sleep(2)

        # Notify Convex of transfer
        convex = agent_state["convex"]
        call_id = agent_state.get("call_id")
        if call_id:
            try:
                await convex.call_ended(
                    call_id=call_id,
                    duration=0,
                    transcript=[],
                    status="transferred",
                )
            except Exception as e:
                logger.error("[transfer_to_human] Failed to notify Convex: %s", e)

        # End pipeline
        task = agent_state.get("task")
        if task:
            await task.queue_frame(EndFrame())

    llm.register_function("transfer_to_human", handle_transfer_to_human)

    logger.info("[tools] Registered %d function tools on LLM service", len(TOOL_DEFINITIONS))
