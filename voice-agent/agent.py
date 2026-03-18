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
from livekit.plugins import noise_cancellation, silero, deepgram, elevenlabs
from livekit.plugins import openai as openai_plugin
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from convex_client import ConvexClient
from call_handler import CallHandler, setup_transcript_listeners
from persona import (
    SYSTEM_PROMPT,
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

# Soft cap on call duration in seconds (25 minutes)
_MAX_CALL_DURATION_SECS = 25 * 60

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

        # ── Guardrail state ──
        self._hostile_strike_count: int = 0
        self._off_topic_count: int = 0
        self._silence_timer_task: asyncio.Task | None = None
        self._silence_prompted: bool = False  # True after "are you still there?"
        self._duration_warned: bool = False  # True once we issue the 25-min warning
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
        # New expanded fields
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
        # Partner preference fields (what they want in a partner)
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
        """Save all profile information gathered during the intake call.
        Call this ONCE at the end of the conversation after saying goodbye,
        with everything you learned about the caller.

        Args:
            first_name: The caller's first name.
            last_name: The caller's last name.
            age: The caller's age.
            location: Where the caller currently lives.
            hometown: Where the caller grew up or is originally from.
            willing_to_relocate: Whether they'd relocate or date long distance.
            ethnicity: Jewish ethnic background (Ashkenazi, Sephardic, Persian, Israeli, etc.).
            occupation: What the caller does for work.
            family_info: Family details — siblings, parents, closeness, marital status of siblings.
            jewish_observance: Level of observance (Reform, Conservative, Orthodox, Traditional, secular, etc.).
            kosher_level: Kosher details (not kosher, kosher-style, kosher meat only, kosher in/out, fully kosher).
            shabbat_observance: How they observe Shabbat (Friday dinners, full observance, not at all, etc.).
            relationship_history: Previous relationships, what happened, patterns noticed, lessons learned.
            looking_for: Description of their ideal partner — personality, values, lifestyle.
            physical_preferences: Physical type preferences (height, build, look, etc.).
            age_range_preference: Age range they are willing to date.
            must_haves: Things they absolutely need in a partner.
            dealbreakers: Absolute deal breakers.
            marriage_timeline: When they want to get married.
            kids_preference: Whether they want kids, how many, when.
            day_in_life: What a typical day looks like for them.
            hobbies: Interests, hobbies, fitness habits.
            additional_notes: Anything else noteworthy from the conversation.
            height: Height (e.g. "5'10", "178cm").
            hair_color: Hair color.
            eye_color: Eye color.
            smoke: Smoking habits.
            drink_alcohol: Drinking habits.
            pets: Whether they have pets and what kind.
            languages: Languages spoken.
            political_affiliation: Political leaning or affiliation.
            education_level: Highest education level.
            college_details: College/university details.
            weekend_preferences: How they spend weekends.
            friends_describe: How their friends would describe them.
            organizations: Organizations or communities they belong to.
            personal_growth: Personal growth interests or journey.
            what_you_notice: What they first notice in a person.
            instagram: Instagram handle.
            children_details: Details about their children.
            long_distance: Willingness for long distance (yes/no/maybe).
            nationality: Nationality or cultural background.
            sexual_orientation: Sexual orientation.
            birthdate: Date of birth (YYYY-MM-DD if possible).
            career_overview: Career overview and trajectory.
            relationship_status: Current relationship status.
            income: Income level or range.
            upbringing: Upbringing and family values background.
            pref_seeking: Gender they're seeking (male/female/non-binary).
            pref_sexual_orientation: Preferred sexual orientation of partner.
            pref_relationship_status: Preferred relationship status of partner.
            pref_ethnicity: Preferred ethnicity of partner.
            pref_religion: Preferred religion of partner.
            pref_education: Preferred education level of partner.
            pref_income: Preferred income level of partner.
            pref_height_range: Preferred height range (e.g. "5'4-6'0").
            pref_hair_color: Preferred hair color of partner.
            pref_eye_color: Preferred eye color of partner.
            pref_political: Preferred political affiliation of partner.
            pref_smoking: Would they date a smoker (yes socially/yes regularly/no).
            pref_drinking: Would they date a drinker (yes socially/yes regularly/no).
            pref_children: Would they date someone with children (no/yes not impacting/shared custody/dependent).
            pref_relocating: Open to relocating (yes/no/maybe).
            pref_partner_values: Top values they want in partner (e.g. trust, respect, communication).
            pref_partner_interests: Interests they want in partner (e.g. travel, hiking, dining out).
            membership_interest: If the caller expressed interest in a paid tier — "member" for Membership or "vip" for VIP Matchmaking. Only set if they clearly expressed interest.
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
            # New expanded fields
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
            # Partner preference fields
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
            # Membership interest
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
        any of that data (change their photo, update Instagram, etc.).
        The link will be sent to their WhatsApp immediately.
        Tell them: 'I just sent you a link on WhatsApp — you can fill in
        your details there whenever you get a chance.'"""
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
        Use this when the caller asks to speak with a real person, or when
        you need to escalate.

        Args:
            transfer_to: Who to transfer to. Use "dani" for Dani Bergman
                or "jane" for Jane. These map to their phone numbers.
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
            # Use LiveKit SIP transfer to connect the caller to the target phone
            job_ctx = get_job_context()
            room = job_ctx.room

            # Find the SIP participant (the caller)
            sip_participant = None
            for p in room.remote_participants.values():
                if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                    sip_participant = p
                    break

            if not sip_participant:
                logger.error("[transfer_call] No SIP participant found in room")
                return "I'm sorry, I wasn't able to connect the transfer. Let me take a note and have them call you back."

            # Perform SIP REFER transfer via LiveKit API
            lk_api = job_ctx.api
            await lk_api.sip.transfer_sip_participant(
                api.TransferSIPParticipantRequest(
                    room_name=room.name,
                    participant_identity=sip_participant.identity,
                    transfer_to=f"sip:{target_phone}@sip.twilio.com",
                )
            )

            logger.info("[transfer_call] SIP transfer initiated to %s", target_phone)

            # Mark call as transferred
            await asyncio.sleep(2)
            await self._call_handler.on_call_end(status="transferred")

            return f"Transfer to {transfer_to} initiated."

        except Exception as e:
            logger.error("[transfer_call] Transfer failed: %s", e)
            return "I'm sorry, the transfer didn't go through. Let me make a note and have them reach out to you directly."

    @function_tool()
    async def end_call(self, context: RunContext) -> str:
        """End the conversation. Call this after you've said goodbye and
        after you've called save_intake_data with the collected information."""
        logger.info("[end_call] Agent initiating call end — waiting 3s for goodbye audio")
        self._cancel_guardrail_timers()
        await asyncio.sleep(3)
        # Must call on_call_end BEFORE shutdown — shutdown kills the process immediately
        logger.info("[end_call] Sending call-ended to Convex before shutdown")
        await self._call_handler.on_call_end()
        logger.info("[end_call] Calling shutdown()")
        get_job_context().shutdown()
        return "Call ended."

    @function_tool()
    async def transfer_to_human(self, context: RunContext) -> str:
        """Transfer the caller to a human team member. Call this when the
        caller is hostile or explicitly requests to speak with a person.
        Say 'Let me connect you with a team member' first, then call this."""
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
        """Reset the silence detection timer — called every time we
        receive a user utterance."""
        # Cancel any existing timer
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
            # No user speech for _SILENCE_THRESHOLD_SECS — prompt them
            logger.info("[guardrail:silence] No speech for %ds — prompting caller",
                        int(_SILENCE_THRESHOLD_SECS))
            self._silence_prompted = True
            await session.generate_reply(
                instructions=(
                    "The caller has been silent for a while. "
                    "Say: 'Hey, are you still there?' in a warm, checking-in tone. "
                    "Wait for a response."
                ),
            )

            # Wait another interval — if still silent, gracefully end
            await asyncio.sleep(_SILENCE_AFTER_PROMPT_SECS)
            logger.info("[guardrail:silence] Still silent after prompt — ending call gracefully")
            await session.generate_reply(
                instructions=(
                    "The caller is still silent after your check-in. "
                    "Say: 'Looks like I might have lost you. I'll save everything "
                    "we've covered so far — feel free to call back anytime!' "
                    "Then call save_intake_data with whatever data you have, "
                    "followed by end_call."
                ),
            )
        except asyncio.CancelledError:
            pass  # Timer was reset or call ended — this is normal

    async def _duration_watchdog(self, session: AgentSession):
        """Background task: watch for the 25-minute soft cap."""
        try:
            remaining = _MAX_CALL_DURATION_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            if self._duration_warned:
                return  # Already warned — don't double-fire

            self._duration_warned = True
            logger.info("[guardrail:duration] Call hit %d-minute soft cap — triggering wrap-up",
                        _MAX_CALL_DURATION_SECS // 60)
            await session.generate_reply(
                instructions=(
                    "The call has been going for about 25 minutes. "
                    "Start wrapping up gracefully. Say something like: "
                    "'We're covering great ground! Let me just wrap up "
                    "the key items real quick.' Then prioritize any remaining "
                    "high-priority missing fields, ask if there's anything else, "
                    "send the form link if needed, and close out warmly. "
                    "Do NOT abruptly end — but move toward the finish."
                ),
            )
        except asyncio.CancelledError:
            pass


# ── SMA Profile Field Definitions ─────────────────────────────────────

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

# Labels for camelCase extractedData keys → human-readable names
# (expanded to include all new fields)
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
    - Mostly complete (>70% fields filled): Short update flow, no full intake
    - Incomplete: Guided intake with gaps highlighted
    """
    # We'll determine completeness after counting fields below
    lines = [
        "## Caller context",
        "",  # Placeholder — we'll insert the right context block later
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
            names = ", ".join(u.get("name", "") for u in client_details["assignedUsers"] if u.get("name"))
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

    # ── SMA Profile Data ──────────────────────────────────────────
    sma_profile = member.get("smaProfile") or {}
    sma_prefs = member.get("smaPreferences") or {}
    prev_intake = member.get("previousIntake") or {}

    # Merge all data sources: SMA profile + SMA prefs + previous intake
    # SMA data takes priority, previous intake fills gaps
    all_data: dict[str, any] = {}
    all_data.update(prev_intake)  # lowest priority
    all_data.update(sma_profile)  # higher priority
    # Preferences go into their own section

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
        lines += ["", "**SMA Profile — Filled fields:**"]
        for cat in ["Basic Information", "Interests & Social Life", "Career",
                     "Background & Education", "Family & Relationships"]:
            if cat in filled_by_cat:
                lines.append(f"  {cat}:")
                for item in filled_by_cat[cat]:
                    lines.append(f"    - {item}")

    # Show missing fields
    if missing_high or missing_other:
        lines += ["", "**Missing fields (PRIORITY — collect these):**"]
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

    # ── Data Request (form link) fields ─────────────────────────────
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
            "- During the call, mention that you'll send them a link to fill in: "
            + ", ".join(missing_labels) + ".",
            "- Call send_data_request_link() to send the WhatsApp form link.",
            "- Say something like: 'I just sent you a link on WhatsApp — you can "
            "fill in [the missing items] there whenever you get a chance.'",
            "- You can send the link at any natural point — during the conversation "
            "when discussing missing info, or towards the end during wrap-up.",
            "- Do NOT ask them to verbally spell out their email, Instagram handle, "
            "etc. — the form is much easier for that kind of data.",
        ]
    else:
        lines += [
            "",
            "**Profile completion form:** All form fields are currently filled.",
            "- If the member asks to update any of their info (photo, email, Instagram, "
            "location, etc.), you can still call send_data_request_link() and say: "
            "'I just sent you a link on WhatsApp — you can update your details there.'",
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

    # Guidance for the agent — adaptive based on completeness
    if completeness > 0.7:
        lines += [
            "",
            f"**Profile completeness: {int(completeness * 100)}% — mostly filled.**",
            "",
            "**Guidance:**",
            "- Go straight into the profile. Do NOT ask 'what can I help you with?' or 'what brings you in?'",
            "- Fill any remaining gaps naturally through conversation.",
            "- VERIFY existing info: casually confirm key details are still current (job, location, relationship status, preferences).",
            "  For example: 'I see you're in [city] — still there?' or 'You're still doing [job], right?'",
            "- If they mention something changed, update that field — the new data WILL overwrite the old.",
            "- If they want to upgrade membership, note it with membership_interest and let them know Dani will follow up.",
            "- If recalibrating, explore the patterns noted above.",
        ]
    else:
        lines += [
            "",
            f"**Profile completeness: {int(completeness * 100)}% — significant gaps remain.**",
            "",
            "**Guidance:**",
            "- Go straight into filling profile gaps. Do NOT ask 'what brings you in today?'",
            "- Say something like: 'I'd love to fill in a few things for your profile — it'll help us find you better matches.'",
            "- Prioritize high-priority missing fields first.",
            "- Also VERIFY existing info is still current — if something changed, save the new value.",
            "- Do NOT skip fields just because they're already filled — if the caller gives you updated info, INCLUDE it in save_intake_data.",
            "- If recalibrating, explore the patterns noted above.",
        ]

    return "\n".join(lines)


# ── Entrypoint ───────────────────────────────────────────────────────

async def entrypoint(ctx: agents.JobContext):
    # Connect to the room first — required before any room interaction
    await ctx.connect()

    convex = ConvexClient()
    call_handler = CallHandler(convex)

    # Parse dispatch metadata
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
            logger.info("[entrypoint] Dispatch metadata: phone=%s sandbox=%s direction=%s context=%s",
                        phone_number, is_sandbox, call_direction, call_context)
        except (json.JSONDecodeError, AttributeError):
            logger.warning("[entrypoint] Failed to parse dispatch metadata: %s", ctx.job.metadata)

    # Wait for the SIP participant to join.
    # For inbound calls, they may already be in the room.
    # For outbound calls, we dispatched first so we need to wait for the
    # callee to answer and appear as a SIP participant.
    caller_phone = phone_number or call_handler.get_caller_phone(ctx.room)

    sip_call_id = None
    # Check if SIP participant is already in the room
    for p in ctx.room.remote_participants.values():
        if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            sip_call_id = p.sid
            if not caller_phone:
                caller_phone = call_handler.get_caller_phone(ctx.room)
            break

    # For outbound calls, if no SIP participant yet, wait for them to answer
    if call_direction == "outbound" and sip_call_id is None:
        logger.info("[entrypoint] Outbound call — waiting for callee to answer...")
        try:
            # Wait up to 45 seconds for the callee to pick up
            # (the SIP gateway handles ringing / no-answer / busy detection)
            wait_event = asyncio.Event()

            def on_participant_connected(participant: rtc.RemoteParticipant):
                if participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                    wait_event.set()

            ctx.room.on("participant_connected", on_participant_connected)
            try:
                await asyncio.wait_for(wait_event.wait(), timeout=45.0)
            except asyncio.TimeoutError:
                logger.warning("[entrypoint] Outbound call — callee did not answer within 45s")
                await call_handler.on_call_start(
                    room=ctx.room,
                    phone=caller_phone,
                    direction="outbound",
                    lk_api=ctx.api,
                )
                await call_handler.on_call_end(status="no_answer")
                await convex.close()
                get_job_context().shutdown()
                return

            # Re-scan for the SIP participant
            for p in ctx.room.remote_participants.values():
                if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                    sip_call_id = p.sid
                    if not caller_phone:
                        caller_phone = call_handler.get_caller_phone(ctx.room)
                    break
            logger.info("[entrypoint] Outbound call — callee answered (sip_call_id=%s)", sip_call_id)
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

    # ── Identity Check: Phone Lookup → Branching Logic ─────────────────
    #
    # Decision tree:
    # 1. call_handler.on_call_start already looked up phone in local DB
    # 2. If NOT found locally, try a deeper lookup (SMA CRM fallback)
    # 3. Result determines the greeting and flow:
    #    a) Existing profile found → confirm name → shortened intake
    #    b) No profile found → new caller → collect email → full intake
    #    c) Lookup failed → treat as new (graceful fallback)

    caller_status = "unknown"  # "existing", "new", "lookup_failed"
    lookup_source = None

    if call_handler.member and call_handler.member.get("_id"):
        # Found in local DB during call_started
        caller_status = "existing"
        lookup_source = "local"
        logger.info("[entrypoint] Member found in local DB: %s (id=%s, smaId=%s)",
                     call_handler.member.get("firstName"),
                     call_handler.member.get("_id"),
                     call_handler.member.get("smaId"))
    elif caller_phone and call_direction == "inbound":
        # Not in local DB — try deeper phone lookup (SMA CRM fallback)
        logger.info("[entrypoint] No local member — running deep phone lookup for %s", caller_phone)
        try:
            lookup_result = await convex.lookup_phone(caller_phone)
            if lookup_result and lookup_result.get("found"):
                # Found in SMA — the backend already synced to local DB
                member_data = lookup_result.get("member")
                if member_data:
                    call_handler.member = member_data
                    lookup_source = lookup_result.get("source", "sma")
                    caller_status = "existing"
                    logger.info("[entrypoint] Deep lookup found member: %s (source=%s)",
                                member_data.get("firstName"), lookup_source)
                else:
                    # Partial SMA result (basic info only)
                    caller_status = "existing"
                    lookup_source = "sma_partial"
                    call_handler.member = {
                        "firstName": lookup_result.get("firstName", ""),
                        "lastName": lookup_result.get("lastName"),
                        "smaId": lookup_result.get("smaId"),
                    }
                    logger.info("[entrypoint] Deep lookup found partial SMA data: %s",
                                lookup_result.get("firstName"))
            else:
                caller_status = "new"
                logger.info("[entrypoint] Deep lookup returned no results — caller is new")
        except Exception as e:
            caller_status = "lookup_failed"
            logger.warning("[entrypoint] Deep phone lookup failed (treating as new): %s", e)
    else:
        caller_status = "new" if caller_phone else "unknown"
        logger.info("[entrypoint] No member match — caller_status=%s", caller_status)

    # Fetch fresh SMA profile + client details for existing members
    if caller_status == "existing" and call_handler.member and call_handler.member.get("_id"):
        if call_handler.member.get("smaId"):
            logger.info("[entrypoint] Fetching fresh SMA profile + client details")
            try:
                result = await convex.fetch_sma_profile(call_handler.member["_id"])
                if result:
                    call_handler.member["smaProfile"] = result.get("smaProfile", {})
                    call_handler.member["smaPreferences"] = result.get("smaPreferences", {})
                    call_handler.member["clientDetails"] = result.get("clientDetails")
                    logger.info("[entrypoint] Fetched SMA: %d profile fields, %d pref fields, details=%s",
                                len(call_handler.member.get("smaProfile", {})),
                                len(call_handler.member.get("smaPreferences", {})),
                                "yes" if result.get("clientDetails") else "no")
            except Exception as e:
                logger.warning("[entrypoint] Failed to fetch SMA profile (non-fatal): %s", e)
                # Fall back to cached data if available
                cached = call_handler.member.get("smaProfile") or {}
                if cached:
                    prefs = cached.pop("preferences", {}) if isinstance(cached.get("preferences"), dict) else {}
                    call_handler.member["smaProfile"] = cached
                    call_handler.member["smaPreferences"] = prefs
                    logger.info("[entrypoint] Using cached profile: %d fields", len(cached))
        else:
            logger.info("[entrypoint] Member has no smaId — no SMA data to fetch")

    # Build the agent
    agent = MatchaAgent(convex=convex, call_handler=call_handler)

    # Enrich the system prompt based on caller status
    if caller_status == "existing" and call_handler.member:
        agent._instructions += "\n\n" + _build_member_context(call_handler.member)
    elif caller_status == "new":
        agent._instructions += f"\n\n## Caller context\n{NEW_CALLER_COLLECT_EMAIL_CONTEXT}"
    elif caller_status == "lookup_failed":
        agent._instructions += f"\n\n## Caller context\n{LOOKUP_FAILED_CONTEXT}"
    else:
        agent._instructions += f"\n\n## Caller context\n{UNKNOWN_CALLER_CONTEXT}"

    # Add outbound call context to system prompt
    if call_direction == "outbound":
        ctx_key = call_context.split(":")[0].strip() if call_context else "full_intake"
        outbound_ctx = OUTBOUND_CONTEXT.get(ctx_key, OUTBOUND_CONTEXT["full_intake"])
        agent._instructions += f"\n\n## Outbound Call Instructions\n{outbound_ctx}"
        if agent_notes:
            agent._instructions += f"\n\n## Agent Notes (from dashboard)\n{agent_notes}"
        # Add bad-time handling
        agent._instructions += f"\n\n## If they say it's not a good time\n{OUTBOUND_BAD_TIME_INSTRUCTIONS}"

    # Add identity check handling instructions for existing callers
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

    # Create and start the session
    # VAD tuned for phone calls: higher threshold to ignore background noise,
    # longer silence padding so it doesn't cut off mid-sentence
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
            model=LLM_MODEL,
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY", ""),
        ),
        tts=elevenlabs.TTS(voice_id="hA4zGnmTwX2NQiTRMt7o"),
        vad=silero.VAD.load(
            min_speech_duration=0.15,     # ignore very short sounds (< 150ms)
            min_silence_duration=0.6,     # wait longer before deciding user stopped talking
            activation_threshold=0.65,    # higher = less sensitive to background noise (default 0.5)
        ),
        turn_detection=MultilingualModel(),
    )

    # Track the LLM model name for usage analytics
    call_handler._llm_model = LLM_MODEL

    # ── Guardrail: user-message callback ─────────────────────────────
    # This fires on every caller utterance to drive hostile detection,
    # off-topic counting, and silence-timer resets.
    async def _on_user_message(text: str):
        """Process each user message for guardrail checks."""
        # Reset silence timer — the caller just spoke
        agent._reset_silence_timer(session)

        # ── Hostile language check ──
        if _is_hostile(text):
            agent._hostile_strike_count += 1
            agent._off_topic_count = 0  # Reset off-topic on hostile (different guardrail)
            logger.info("[guardrail:hostile] Strike %d — hostile text: %s",
                        agent._hostile_strike_count, text[:80])
            if agent._hostile_strike_count >= 2:
                # Second strike — transfer immediately
                logger.info("[guardrail:hostile] Second strike — initiating transfer")
                await session.generate_reply(
                    instructions=(
                        "The caller has been hostile multiple times. "
                        "Say: 'I understand you're frustrated. Let me "
                        "connect you with a team member who can help you "
                        "directly.' Then call transfer_to_human."
                    ),
                )
            elif agent._hostile_strike_count == 1:
                # First strike — de-escalate and warn
                await session.generate_reply(
                    instructions=(
                        "The caller just used hostile or abusive language. "
                        "Stay calm and empathetic. Say something like: "
                        "'I completely understand your frustration. I'm here "
                        "to help — if you'd prefer to speak with a team "
                        "member, I can connect you right away. Otherwise, "
                        "I'd love to keep going with your profile.' "
                        "Wait for their response."
                    ),
                )
            return  # Don't also check off-topic on hostile messages

        # ── Off-topic redirect (LLM-assisted via system prompt handles
        #    detection; we track consecutive off-topic count here for
        #    the escalating firmness described in persona.py) ──
        # Reset off-topic count on any non-hostile message — the LLM
        # handles the actual redirect via its system prompt instructions.
        # We keep the counter available for future programmatic detection.
        agent._off_topic_count = 0

    # Wire up transcript streaming with guardrail callback
    setup_transcript_listeners(session, call_handler, on_user_message=_on_user_message)

    # Use an event to keep entrypoint alive until session closes
    session_closed = asyncio.Event()

    @session.on("close")
    def on_close(*args):
        logger.info("[session:close] Session closed — signaling entrypoint to run cleanup")
        session_closed.set()

    await session.start(
        agent=agent,
        room=ctx.room,
    )

    # ── Greeting: adapt based on direction, caller status, and identity ──
    if call_direction == "outbound":
        # Outbound call — use context-specific greeting
        ctx_key = call_context.split(":")[0].strip() if call_context else "full_intake"
        _raw = call_handler.member.get("firstName", "") if call_handler.member else ""
        member_name = "" if _raw in ("", "Unknown") else _raw
        name_part = f" {member_name}" if member_name else ""
        greeting_template = OUTBOUND_GREETING.get(ctx_key, OUTBOUND_GREETING["full_intake"])
        greeting_text = greeting_template.format(name_part=name_part)
        greeting = (
            f"This is an outbound call. Greet the person with: '{greeting_text}' "
            f"Wait for their response. If they say it's a good time, proceed. "
            f"If they say it's not a good time, they're busy, or they can't talk — "
            f"say 'No worries at all! You can call us back anytime at this number.' "
            f"and then call end_call."
        )
    elif caller_status == "existing" and call_handler.member:
        # Existing member — confirm identity first
        _raw = call_handler.member.get("firstName", "")
        member_name = "" if _raw in ("", "Unknown") else _raw
        if member_name:
            greeting = (
                f"You believe this is {member_name} based on phone number lookup. "
                f"Confirm their identity by saying something like: 'Hey! Is this "
                f"{member_name}?' Keep it casual and warm — like you recognize them. "
                f"Wait for their response before continuing. "
                f"If they confirm, greet them warmly and go straight into the profile. "
                f"If they say it's not them, ask who you're speaking with."
            )
        else:
            # Existing member but no name — fall back to generic warm greeting
            greeting = (
                "Greet the caller casually and warmly. Say something like "
                "'Hey! Thanks for calling Club Allenby, I'm Matcha. Who am I speaking with?' "
                "Wait for their response."
            )
    elif caller_status == "new":
        # New caller — warm greeting, then full intake
        greeting = (
            "This is a new caller — their phone number wasn't found in our system. "
            "Greet them warmly: 'Hey there! Thanks for calling Club Allenby, I'm "
            "Matcha. What's your name?' Wait for their answer. Then proceed with "
            "the standard intake — housekeeping, the big opening question, and the "
            "full deep dive. At a natural point, mention you'll send them a link "
            "on WhatsApp for their email and other details."
        )
    elif caller_status == "lookup_failed":
        # Lookup failed — treat as potentially new
        greeting = (
            "Greet the caller casually and warmly. Say something like "
            "'Hey! Thanks for calling Club Allenby, I'm Matcha. How are you doing?' "
            "Wait for their response. Then ask their name to identify them."
        )
    else:
        # Unknown caller (no phone number at all) — polite redirect
        await session.say(
            "Hey there! This line is for Club Allenby members. "
            "If you'd like to join, you can sign up at club allenby dot com, "
            "or text Dani directly. Have a great day!",
            allow_interruptions=False,
        )
        logger.info("[entrypoint] Unknown caller — message delivered, ending call")
        await asyncio.sleep(1)
        await call_handler.on_call_end()
        await convex.close()
        logger.info("[entrypoint] Cleanup complete")
        get_job_context().shutdown()
        return

    logger.info("[entrypoint] Greeting caller — status=%s source=%s", caller_status, lookup_source)
    await session.generate_reply(
        instructions=greeting,
    )

    # ── Start guardrail timers after greeting ─────────────────────────
    agent._call_start_time = time.time()
    agent._reset_silence_timer(session)
    agent._duration_check_task = asyncio.create_task(
        agent._duration_watchdog(session)
    )

    # Block here until the session closes (user hangs up or agent calls end_call)
    # This keeps the event loop alive so cleanup can run
    await session_closed.wait()

    # Now run cleanup — the event loop is still alive because entrypoint hasn't returned
    logger.info("[entrypoint] Session ended — running on_call_end + cleanup")
    agent._cancel_guardrail_timers()
    await call_handler.on_call_end()
    await convex.close()
    logger.info("[entrypoint] Cleanup complete")


if __name__ == "__main__":
    agents.cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="matcha-intake-agent",
        )
    )
