"""
Agent Matcha — Voice intake agent for Club Allenby.

Entry point for the LiveKit Agents worker. Run with:
    python3 agent.py dev
"""

from __future__ import annotations

import json
import logging
import os

from dotenv import load_dotenv

from livekit import agents, api, rtc
from livekit.agents import (
    AgentSession,
    Agent,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    function_tool,
    get_job_context,
)
from livekit.plugins import noise_cancellation, silero, deepgram
from livekit.plugins import openai as openai_plugin
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from convex_client import ConvexClient
from call_handler import CallHandler, setup_transcript_listeners
from persona import (
    SYSTEM_PROMPT,
    INBOUND_GREETING_INSTRUCTIONS,
    OUTBOUND_GREETING_INSTRUCTIONS,
    LLM_MODEL,
)
from flows.intake import EXISTING_MEMBER_CONTEXT, NEW_CALLER_CONTEXT

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
    async def check_member_profile(
        self,
        context: RunContext,
        phone_number: str,
    ) -> dict:
        """Look up a caller's profile in the Club Allenby database by phone number.

        Args:
            phone_number: The caller's phone number in E.164 format (e.g. +15551234567).
        """
        member = await self._convex.lookup_member_by_phone(phone_number)
        if member:
            return {
                "found": True,
                "firstName": member.get("firstName"),
                "lastName": member.get("lastName"),
                "tier": member.get("tier"),
                "status": member.get("status"),
                "profileComplete": member.get("profileComplete"),
            }
        return {"found": False}

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
        ]:
            if val is not None:
                data[key] = val

        if not data:
            return {"saved": False, "reason": "no data provided"}

        await self._convex.save_intake_data(call_id=call_id, data=data)
        return {"saved": True}

    @function_tool()
    async def end_call(self, context: RunContext) -> str:
        """End the conversation. Call this after you've said goodbye and
        after you've called save_intake_data with the collected information."""
        import asyncio
        await asyncio.sleep(3)
        get_job_context().shutdown()
        return "Call ended."


# ── Entrypoint ───────────────────────────────────────────────────────

async def entrypoint(ctx: agents.JobContext):
    # Connect to the room first — required before any room interaction
    await ctx.connect()

    convex = ConvexClient()
    call_handler = CallHandler(convex)

    # Determine if this is an outbound call (metadata contains phone_number)
    phone_number: str | None = None
    is_outbound = False
    if ctx.job.metadata:
        try:
            meta = json.loads(ctx.job.metadata)
            phone_number = meta.get("phone_number")
            is_outbound = phone_number is not None
        except (json.JSONDecodeError, AttributeError):
            pass

    # For outbound calls, place the call via SIP
    if is_outbound and phone_number:
        outbound_trunk_id = os.environ.get("LIVEKIT_SIP_OUTBOUND_TRUNK_ID", "")
        try:
            await ctx.api.sip.create_sip_participant(
                api.CreateSIPParticipantRequest(
                    room_name=ctx.room.name,
                    sip_trunk_id=outbound_trunk_id,
                    sip_call_to=phone_number,
                    participant_identity=phone_number,
                    wait_until_answered=True,
                )
            )
            logger.info("Outbound call answered: %s", phone_number)
        except Exception as e:
            logger.error("Outbound call failed: %s", e)
            ctx.shutdown()
            return

    # Wait for a participant to join (inbound) or use the one we just created (outbound)
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
        direction="outbound" if is_outbound else "inbound",
        lk_api=ctx.api,
    )

    # Build the agent
    agent = MatchaAgent(convex=convex, call_handler=call_handler)

    # Enrich the system prompt with caller context
    if call_handler.member:
        agent._instructions += f"\n\n## Caller context\n{EXISTING_MEMBER_CONTEXT}"
        agent._instructions += (
            f"\nCaller name: {call_handler.member.get('firstName', 'Unknown')}"
            f"\nTier: {call_handler.member.get('tier', 'unknown')}"
            f"\nProfile complete: {call_handler.member.get('profileComplete', False)}"
        )
    else:
        agent._instructions += f"\n\n## Caller context\n{NEW_CALLER_CONTEXT}"

    # Create and start the session
    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language="multi"),
        llm=openai_plugin.LLM(
            model=LLM_MODEL,
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY", ""),
        ),
        tts=deepgram.TTS(model="aura-2-asteria-en"),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
    )

    # Wire up transcript streaming
    setup_transcript_listeners(session, call_handler)

    # Handle session end
    @session.on("close")
    def on_close(*args):
        import asyncio
        asyncio.create_task(call_handler.on_call_end())
        asyncio.create_task(convex.close())

    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    # Greet (inbound only — for outbound, let the person speak first)
    if not is_outbound:
        await session.generate_reply(
            instructions=INBOUND_GREETING_INSTRUCTIONS,
        )


if __name__ == "__main__":
    agents.cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            agent_name="matcha-intake-agent",
        )
    )
