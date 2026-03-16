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

from dotenv import load_dotenv

from livekit import agents, rtc
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
)

load_dotenv()

logger = logging.getLogger("matcha-agent")


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
    async def end_call(self, context: RunContext) -> str:
        """End the conversation. Call this after you've said goodbye and
        after you've called save_intake_data with the collected information."""
        logger.info("[end_call] Agent initiating call end — waiting 3s for goodbye audio")
        await asyncio.sleep(3)
        # Must call on_call_end BEFORE shutdown — shutdown kills the process immediately
        logger.info("[end_call] Sending call-ended to Convex before shutdown")
        await self._call_handler.on_call_end()
        logger.info("[end_call] Calling shutdown()")
        get_job_context().shutdown()
        return "Call ended."


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

    # Wait for a participant to join
    caller_phone = phone_number or call_handler.get_caller_phone(ctx.room)

    # Log call start
    sip_call_id = None
    for p in ctx.room.remote_participants.values():
        if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
            sip_call_id = p.sid
            if not caller_phone:
                caller_phone = call_handler.get_caller_phone(ctx.room)
            break

    await call_handler.on_call_start(
        room=ctx.room,
        sip_call_id=sip_call_id,
        phone=caller_phone,
        direction=call_direction,
        lk_api=ctx.api,
        sandbox=is_sandbox,
    )

    # Fetch fresh SMA profile + client details for full context
    if call_handler.member and call_handler.member.get("_id"):
        logger.info("[entrypoint] Member found: %s (id=%s, smaId=%s)",
                     call_handler.member.get("firstName"),
                     call_handler.member.get("_id"),
                     call_handler.member.get("smaId"))
        # Always fetch fresh data from SMA so agent has the latest profile
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
                    # Cached data has preferences nested inside
                    prefs = cached.pop("preferences", {}) if isinstance(cached.get("preferences"), dict) else {}
                    call_handler.member["smaProfile"] = cached
                    call_handler.member["smaPreferences"] = prefs
                    logger.info("[entrypoint] Using cached profile: %d fields", len(cached))
        else:
            logger.info("[entrypoint] Member has no smaId — no SMA data to fetch")
    else:
        logger.info("[entrypoint] No member match — caller is unknown")

    # Build the agent
    agent = MatchaAgent(convex=convex, call_handler=call_handler)

    # Enrich the system prompt with caller context
    if call_handler.member:
        agent._instructions += "\n\n" + _build_member_context(call_handler.member)
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
        tts=elevenlabs.TTS(voice="hA4zGnmTwX2NQiTRMt7o"),
        vad=silero.VAD.load(
            min_speech_duration=0.15,     # ignore very short sounds (< 150ms)
            min_silence_duration=0.6,     # wait longer before deciding user stopped talking
            activation_threshold=0.65,    # higher = less sensitive to background noise (default 0.5)
        ),
        turn_detection=MultilingualModel(),
    )

    # Wire up transcript streaming
    setup_transcript_listeners(session, call_handler)

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

    # Greet the caller — adapt based on direction and caller type
    if call_direction == "outbound":
        # Outbound call — use context-specific greeting
        ctx_key = call_context.split(":")[0].strip() if call_context else "full_intake"
        member_name = call_handler.member.get("firstName", "") if call_handler.member else ""
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
    elif call_handler.member:
        member_name = call_handler.member.get("firstName", "")
        greeting = (
            f"Greet {member_name} warmly by name — they're a returning member. "
            f"Say something like 'Hey {member_name}! Great to hear from you, "
            f"how are you doing?' Keep it brief and warm. After they respond, "
            f"go straight into the profile — either filling gaps or verifying "
            f"existing info. Do NOT ask 'what can I help you with?' or 'what "
            f"brings you in?' — you already know what to do: work on their profile."
        )
    else:
        # Unknown caller — say a fixed message and hang up, no LLM needed
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

    await session.generate_reply(
        instructions=greeting,
    )

    # Block here until the session closes (user hangs up or agent calls end_call)
    # This keeps the event loop alive so cleanup can run
    await session_closed.wait()

    # Now run cleanup — the event loop is still alive because entrypoint hasn't returned
    logger.info("[entrypoint] Session ended — running on_call_end + cleanup")
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
