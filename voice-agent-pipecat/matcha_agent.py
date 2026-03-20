"""Main pipeline assembly — builds and runs the Pipecat voice agent.

Exports a single async function `run_agent(transport)` that:
1. Creates all services (STT, LLM, TTS)
2. Creates the LLM context with system prompt + tool definitions
3. Assembles the pipeline in the correct order
4. Sets up QuickAckProcessor with cached audio
5. Sets up guardrails and transcript processors
6. Handles caller identity detection (phone lookup via Convex)
7. Builds member context for existing callers
8. Sends the appropriate greeting
9. Runs the pipeline
"""

import asyncio
import logging
from typing import Any

from pipecat.frames.frames import EndFrame, TTSSpeakFrame, LLMMessagesFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.aggregators.llm_response import LLMUserAggregatorParams

from convex_client import ConvexClient
from persona import SYSTEM_PROMPT
from flows.intake import (
    EXISTING_MEMBER_MOSTLY_COMPLETE,
    EXISTING_MEMBER_INCOMPLETE,
    NEW_CALLER_COLLECT_EMAIL_CONTEXT,
    LOOKUP_FAILED_CONTEXT,
    UNKNOWN_CALLER_CONTEXT,
    IDENTITY_CONFIRMED_CONTEXT,
    IDENTITY_WRONG_NAME_CONTEXT,
    OUTBOUND_CONTEXT,
    OUTBOUND_GREETING,
    OUTBOUND_BAD_TIME_INSTRUCTIONS,
)
from processors.quick_ack import QuickAckProcessor, generate_audio_cache, QUICK_ACK_PHRASES
from processors.guardrails import GuardrailProcessor
from processors.transcript import TranscriptProcessor
from services import create_stt, create_llm, create_tts
from tools import TOOL_DEFINITIONS, register_tools

logger = logging.getLogger("matcha-agent")


# ═══════════════════════════════════════════════════════════════════════════
# SMA Profile Field Definitions
# ═══════════════════════════════════════════════════════════════════════════

# Maps our human-readable keys (from SMA PROFILE_FIELD_MAP) to display labels
# grouped by category for the system prompt.
SMA_PROFILE_FIELDS: dict[str, tuple[str, str]] = {
    # key: (display_label, category)
    # Basic Information
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
    # Interests & Social Life
    "interests": ("Interests", "Interests & Social Life"),
    "dayInLife": ("Day in Life", "Interests & Social Life"),
    "weekendPreferences": ("Weekend Preferences", "Interests & Social Life"),
    "friendsDescribe": ("How Friends Describe", "Interests & Social Life"),
    "organizations": ("Organizations", "Interests & Social Life"),
    "personalGrowth": ("Personal Growth", "Interests & Social Life"),
    "whatYouNotice": ("What You Notice in a Person", "Interests & Social Life"),
    # Career
    "occupation": ("Occupation", "Career"),
    "careerOverview": ("Career Overview", "Career"),
    "income": ("Income", "Career"),
    # Background & Education
    "nationality": ("Nationality", "Background & Education"),
    "religion": ("Religion", "Background & Education"),
    "jewishObservance": ("Jewish Observance", "Background & Education"),
    "topValues": ("Top 3 Values", "Background & Education"),
    "upbringing": ("Upbringing & Family Values", "Background & Education"),
    "educationLevel": ("Education Level", "Background & Education"),
    "collegeDetails": ("College Details", "Background & Education"),
    # Family & Relationships
    "currentRelationshipStatus": ("Current Relationship Status", "Family & Relationships"),
    "relationshipHistory": ("Relationship History", "Family & Relationships"),
    "hasChildren": ("Has Children", "Family & Relationships"),
    "childrenDetails": ("Children Details", "Family & Relationships"),
    "wantChildren": ("Want Children", "Family & Relationships"),
}

SMA_PREFERENCE_FIELDS: dict[str, str] = {
    # key: display_label
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

# Priority fields to highlight when missing
_HIGH_PRIORITY_MISSING = {
    "ethnicity", "religion", "jewishObservance", "relationshipHistory",
    "occupation", "location", "age", "height",
}

# Labels for camelCase extractedData keys -> human-readable names
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


# ═══════════════════════════════════════════════════════════════════════════
# Member context builder — ported from LiveKit agent
# ═══════════════════════════════════════════════════════════════════════════

def _build_member_context(member: dict) -> str:
    """Build a rich '## Caller context' block from full member data including SMA profile.

    Adapts the context instructions based on profile completeness:
    - Mostly complete (>70% fields filled): Short update flow, no full intake
    - Incomplete: Guided intake with gaps highlighted
    """
    lines = [
        "## Caller context",
        "",  # Placeholder -- we'll insert the right context block later
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

    # Client details from SMA (email, created date, assigned matchmakers)
    client_details = member.get("clientDetails")
    if client_details:
        details_parts = []
        if client_details.get("id"):
            details_parts.append(f"SMA ID: {client_details['id']}")
        if client_details.get("created"):
            details_parts.append(f"Joined: {client_details['created'][:10]}")
        if client_details.get("assignedUsers"):
            names = ", ".join(
                u.get("name", "") for u in client_details["assignedUsers"] if u.get("name")
            )
            if names:
                details_parts.append(f"Assigned to: {names}")
        if details_parts:
            lines.append(" | ".join(details_parts))

    # Matchmaker notes
    if member.get("matchmakerNotes"):
        lines += ["", "**Matchmaker notes:**", member["matchmakerNotes"]]

    # Rejection count
    if member.get("rejectionCount"):
        lines.append(f"\nRejection count: {member['rejectionCount']}")

    # Recalibration summary
    recal = member.get("recalibrationSummary")
    if recal:
        lines += ["", "**Recalibration:**"]
        if recal.get("summary"):
            lines.append(f"Pattern: {recal['summary']}")
        if recal.get("keyPatterns"):
            patterns = ", ".join(recal["keyPatterns"])
            count = recal.get("feedbackCount", "?")
            lines.append(f"Key patterns: {patterns} (from {count} feedback responses)")

    # ── SMA Profile Data ─────────────────────────────────────────────
    sma_profile = member.get("smaProfile") or {}
    sma_prefs = member.get("smaPreferences") or {}
    prev_intake = member.get("previousIntake") or {}

    # Merge all data sources: SMA profile + SMA prefs + previous intake
    # SMA data takes priority, previous intake fills gaps
    all_data: dict[str, Any] = {}
    all_data.update(prev_intake)   # lowest priority
    all_data.update(sma_profile)   # higher priority

    # Build filled and missing lists by category
    filled_by_cat: dict[str, list[str]] = {}
    missing_high: list[str] = []
    missing_other: list[str] = []

    for key, (label, category) in SMA_PROFILE_FIELDS.items():
        val = all_data.get(key)
        if val is not None and val != "" and val != {}:
            # Format location specially
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

    # Show filled fields grouped by category
    if any(filled_by_cat.values()):
        lines += ["", "**SMA Profile -- Filled fields:**"]
        for cat in [
            "Basic Information",
            "Interests & Social Life",
            "Career",
            "Background & Education",
            "Family & Relationships",
        ]:
            if cat in filled_by_cat:
                lines.append(f"  {cat}:")
                for item in filled_by_cat[cat]:
                    lines.append(f"    - {item}")

    # Show missing fields
    if missing_high or missing_other:
        lines += ["", "**Missing fields (PRIORITY -- collect these):**"]
        if missing_high:
            lines.append(f"  High priority: {', '.join(missing_high)}")
        if missing_other:
            lines.append(f"  Secondary: {', '.join(missing_other)}")

    # Show SMA preferences
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

    # Previous intake data (fields not already shown from SMA)
    if prev_intake:
        extra_intake = []
        sma_keys = set(SMA_PROFILE_FIELDS.keys()) | set(SMA_PREFERENCE_FIELDS.keys())
        for key, label in _INTAKE_LABELS.items():
            if key in sma_keys:
                continue  # already shown above
            val = prev_intake.get(key)
            if val is not None and val != "":
                extra_intake.append(f"{label}: {val}")
        if extra_intake:
            lines += ["", "**Additional data from previous calls:**"]
            lines += extra_intake

    # ── Data Request (form link) fields ──────────────────────────────
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
            "**Profile completion form -- missing data:**",
            f"  Missing: {', '.join(missing_labels)}",
        ]
        if has_pending_request:
            lines.append("  (A form link was already sent but not yet filled)")
        lines += [
            "",
            "**Data request instructions:**",
            "- During the call, mention that you'll send them a link to fill in: "
            + ", ".join(missing_labels) + ".",
            "- Call send_data_request_link() to send the WhatsApp form link.",
            "- Say something like: 'I just sent you a link on WhatsApp -- you can "
            "fill in [the missing items] there whenever you get a chance.'",
            "- You can send the link at any natural point -- during the conversation "
            "when discussing missing info, or towards the end during wrap-up.",
            "- Do NOT ask them to verbally spell out their email, Instagram handle, "
            "etc. -- the form is much easier for that kind of data.",
        ]
    else:
        lines += [
            "",
            "**Profile completion form:** All form fields are currently filled.",
            "- If the member asks to update any of their info (photo, email, Instagram, "
            "location, etc.), you can still call send_data_request_link() and say: "
            "'I just sent you a link on WhatsApp -- you can update your details there.'",
        ]

    # Calculate profile completeness
    total_fields = len(SMA_PROFILE_FIELDS) + len(SMA_PREFERENCE_FIELDS)
    filled_count = sum(len(vals) for vals in filled_by_cat.values()) + len(pref_filled)
    completeness = filled_count / total_fields if total_fields else 0

    # Insert the right context block based on completeness
    if completeness > 0.7:
        lines[1] = EXISTING_MEMBER_MOSTLY_COMPLETE
    else:
        lines[1] = EXISTING_MEMBER_INCOMPLETE

    # Guidance for the agent -- adaptive based on completeness
    if completeness > 0.7:
        lines += [
            "",
            f"**Profile completeness: {int(completeness * 100)}% -- mostly filled.**",
            "",
            "**Guidance:**",
            "- Go straight into the profile. Do NOT ask 'what can I help you with?' or 'what brings you in?'",
            "- Fill any remaining gaps naturally through conversation.",
            "- VERIFY existing info: casually confirm key details are still current (job, location, relationship status, preferences).",
            "  For example: 'I see you're in [city] -- still there?' or 'You're still doing [job], right?'",
            "- If they mention something changed, update that field -- the new data WILL overwrite the old.",
            "- If they want to upgrade membership, note it with membership_interest and let them know Dani will follow up.",
            "- If recalibrating, explore the patterns noted above.",
        ]
    else:
        lines += [
            "",
            f"**Profile completeness: {int(completeness * 100)}% -- significant gaps remain.**",
            "",
            "**Guidance:**",
            "- Go straight into filling profile gaps. Do NOT ask 'what brings you in today?'",
            "- Say something like: 'I'd love to fill in a few things for your profile -- it'll help us find you better matches.'",
            "- Prioritize high-priority missing fields first.",
            "- Also VERIFY existing info is still current -- if something changed, save the new value.",
            "- Do NOT skip fields just because they're already filled -- if the caller gives you updated info, INCLUDE it in save_intake_data.",
            "- If recalibrating, explore the patterns noted above.",
        ]

    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════
# Main agent entry point
# ═══════════════════════════════════════════════════════════════════════════

async def run_agent(transport):
    """Main agent entry point -- assembles pipeline and runs.

    Args:
        transport: A Pipecat transport (SmallWebRTCTransport or DailyTransport).
    """

    # ── 1. Create services ──────────────────────────────────────────────
    stt = create_stt()
    llm = create_llm()
    tts = create_tts()

    # ── 2. Create Convex client ─────────────────────────────────────────
    convex = ConvexClient()

    # ── 3. For local/sandbox testing: no phone lookup, treat as new caller
    # (Phone lookup logic will be added when Daily SIP transport is used)
    caller_status = "new"
    member = None
    call_id = None

    # ── 4. Build system prompt with caller context ──────────────────────
    system_prompt = SYSTEM_PROMPT

    # Append caller context based on status (same branching as LiveKit agent)
    if caller_status == "existing" and member:
        system_prompt += "\n\n" + _build_member_context(member)
    elif caller_status == "new":
        system_prompt += f"\n\n## Caller context\n{NEW_CALLER_COLLECT_EMAIL_CONTEXT}"
    elif caller_status == "lookup_failed":
        system_prompt += f"\n\n## Caller context\n{LOOKUP_FAILED_CONTEXT}"
    else:
        system_prompt += f"\n\n## Caller context\n{UNKNOWN_CALLER_CONTEXT}"

    # ── 5. Create LLM context with tools ────────────────────────────────
    context = OpenAILLMContext(
        [{"role": "system", "content": system_prompt}],
        tools=TOOL_DEFINITIONS,
    )
    user_agg_params = LLMUserAggregatorParams(aggregation_timeout=0.1)
    context_aggregator = llm.create_context_aggregator(
        context, user_params=user_agg_params
    )

    # ── 6. Create processors ────────────────────────────────────────────

    # Force-end callback for the 45-minute hard limit
    async def _force_end():
        logger.warning("[matcha-agent] 45-minute hard limit reached -- force ending call")
        if call_id:
            try:
                transcript_proc_ref = transcript_proc
                await convex.call_ended(
                    call_id=call_id,
                    duration=0,
                    transcript=transcript_proc_ref.transcript,
                    status="timeout",
                )
            except Exception as e:
                logger.error("[matcha-agent] Failed to save call on force end: %s", e)
        if task:
            await task.queue_frame(EndFrame())

    quick_ack = QuickAckProcessor()
    quick_ack.set_transport_output(transport.output())

    transcript_proc = TranscriptProcessor(convex, lambda: call_id)
    guardrail_proc = GuardrailProcessor(on_force_end=_force_end)

    # ── 7. Create agent_state dict for tools ────────────────────────────
    agent_state: dict[str, Any] = {
        "convex": convex,
        "call_id": call_id,
        "member": member,
        "phase2_active": False,
        "task": None,       # set after task creation
        "context": context,
        "cancel_guardrails": guardrail_proc.cancel_watchdogs,
        "transcript": transcript_proc,
    }

    # ── 8. Register tool handlers ───────────────────────────────────────
    register_tools(llm, agent_state)

    # ── 9. Build pipeline ───────────────────────────────────────────────
    pipeline = Pipeline([
        transport.input(),
        stt,
        quick_ack,
        guardrail_proc,
        transcript_proc,
        context_aggregator.user(),
        llm,
        tts,
        transport.output(),
        context_aggregator.assistant(),
    ])

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
    )

    # ── 10. Wire up task references ─────────────────────────────────────
    agent_state["task"] = task
    guardrail_proc.set_task(task)

    # ── 11. Log call start to Convex (sandbox mode for local testing) ───
    try:
        result = await convex.call_started(
            livekit_room_id="local-test",
            phone=None,
            direction="inbound",
            sandbox=True,
        )
        call_id = result.get("callId")
        agent_state["call_id"] = call_id
        member = result.get("member")
        agent_state["member"] = member
        logger.info(
            "[matcha-agent] Call started: call_id=%s member=%s",
            call_id,
            member.get("firstName") if member else None,
        )
    except Exception as e:
        logger.warning("[matcha-agent] Failed to log call start: %s", e)

    # If call_started returned an existing member, rebuild context
    if member and member.get("_id"):
        caller_status = "existing"
        # Fetch fresh SMA profile if member has smaId
        if member.get("smaId"):
            logger.info("[matcha-agent] Fetching fresh SMA profile for member")
            try:
                sma_result = await convex.fetch_sma_profile(member["_id"])
                if sma_result:
                    member["smaProfile"] = sma_result.get("smaProfile", {})
                    member["smaPreferences"] = sma_result.get("smaPreferences", {})
                    member["clientDetails"] = sma_result.get("clientDetails")
            except Exception as e:
                logger.warning("[matcha-agent] Failed to fetch SMA profile (non-fatal): %s", e)

        # Rebuild the system prompt with member context
        system_prompt = SYSTEM_PROMPT + "\n\n" + _build_member_context(member)

        # Add identity check handling
        _raw = member.get("firstName", "")
        member_name = "" if _raw in ("", "Unknown") else _raw
        if member_name:
            system_prompt += (
                f"\n\n## Identity confirmation handling\n"
                f"You believe this caller is **{member_name}** based on their phone number.\n"
                f"Your greeting should confirm this: 'Hey, is this {member_name}?'\n\n"
                f"**If they confirm** (yes, yeah, that's me, etc.):\n"
                f"{IDENTITY_CONFIRMED_CONTEXT.format(name=member_name)}\n\n"
                f"**If they say no / wrong person:**\n"
                f"{IDENTITY_WRONG_NAME_CONTEXT.format(expected_name=member_name)}"
            )

        # Update the context messages with enriched prompt
        messages = context.get_messages()
        if messages and messages[0].get("role") == "system":
            messages[0]["content"] = system_prompt
            context.set_messages(messages)

        agent_state["member"] = member

    # ── 12. Generate quick ack audio cache in background ────────────────
    async def _cache_audio():
        try:
            cache = await generate_audio_cache(tts, QUICK_ACK_PHRASES)
            quick_ack.set_cached_audio(cache)
            logger.info("[matcha-agent] Quick ack audio cache ready")
        except Exception as e:
            logger.warning("[matcha-agent] Failed to generate audio cache: %s", e)

    asyncio.create_task(_cache_audio())

    # ── 13. Start guardrail watchdogs ───────────────────────────────────
    guardrail_proc.start_watchdogs()

    # ── 14. Send greeting ───────────────────────────────────────────────
    if caller_status == "existing" and member:
        _raw = member.get("firstName", "")
        member_name = "" if _raw in ("", "Unknown") else _raw
        if member_name:
            greeting = (
                f"Hey! Is this {member_name}?"
            )
        else:
            greeting = (
                "Hey! Thanks for calling Club Allenby, I'm Matcha. Who am I speaking with?"
            )
    elif caller_status == "new":
        greeting = (
            "Hey there! Thanks for calling Club Allenby, I'm Matcha. "
            "How are you doing today?"
        )
    elif caller_status == "lookup_failed":
        greeting = (
            "Hey! Thanks for calling Club Allenby, I'm Matcha. How are you doing?"
        )
    else:
        greeting = (
            "Hey there! Thanks for calling Club Allenby, I'm Matcha. "
            "How are you doing today?"
        )

    logger.info("[matcha-agent] Sending greeting -- caller_status=%s", caller_status)
    await task.queue_frames([TTSSpeakFrame(text=greeting)])

    # ── 15. Run pipeline ────────────────────────────────────────────────
    runner = PipelineRunner()
    await runner.run(task)

    # ── 16. Cleanup ─────────────────────────────────────────────────────
    logger.info("[matcha-agent] Pipeline finished -- running cleanup")
    guardrail_proc.cancel_watchdogs()

    # Send call-ended if not already done by end_call tool
    if call_id:
        try:
            await convex.call_ended(
                call_id=call_id,
                duration=0,
                transcript=transcript_proc.transcript,
                status="completed",
            )
        except Exception as e:
            logger.warning("[matcha-agent] Failed to send call-ended: %s", e)

    await convex.close()
    logger.info("[matcha-agent] Cleanup complete")
