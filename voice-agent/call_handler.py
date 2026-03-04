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
    """Manages a single call's lifecycle: start → transcript streaming → end.

    Data safety strategy:
    - Call record created immediately on start (survives any crash)
    - Transcript segments streamed to Convex in real-time (each sentence
      saved individually — survives crash, only the last unsent sentence lost)
    - Audio recorded via LiveKit Egress (server-side, independent of agent process)
    - If the call crashes before save_intake_data runs, the transcript
      segments are still in Convex and the AI summary action can reconstruct
      the profile data from them
    """

    def __init__(self, convex: ConvexClient):
        self._convex = convex
        self.call_id: str | None = None
        self.member: dict[str, Any] | None = None
        self._transcript: list[dict[str, Any]] = []
        self._start_time: float = 0
        self._egress_id: str | None = None

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

        logger.info(
            "Call started: call_id=%s phone=%s member=%s",
            self.call_id,
            phone,
            self.member.get("firstName") if self.member else "unknown",
        )

        # Start audio recording via LiveKit Egress (server-side, survives agent crash)
        if lk_api and room.name:
            await self._start_recording(lk_api, room.name)

        return result

    async def _start_recording(self, lk_api: api.LiveKitAPI, room_name: str):
        """Start server-side audio recording via LiveKit Egress.

        The recording runs on LiveKit's servers, completely independent
        of the agent process. If the agent crashes, the recording continues
        until the room closes.
        """
        try:
            # Record audio-only as OGG to S3/GCS if configured,
            # otherwise skip recording gracefully
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
                            bucket=bucket,
                            region=region,
                            access_key=access_key,
                            secret=secret_key,
                        ),
                    )
                ],
            )

            result = await lk_api.egress.start_room_composite_egress(req)
            self._egress_id = result.egress_id
            logger.info("Audio recording started: egress_id=%s path=%s", self._egress_id, filepath)

        except Exception as e:
            logger.warning("Failed to start audio recording (non-fatal): %s", e)

    async def on_transcript_segment(
        self,
        *,
        speaker: str,
        text: str,
        confidence: float | None = None,
    ):
        """Stream a single transcript segment to Convex in real-time.

        Each sentence is saved individually to the callTranscriptSegments
        table, so even if the agent crashes mid-call, all previously
        spoken sentences are preserved in the database.
        """
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
        """Called when the call ends. Saves final transcript and triggers
        AI summary generation (which also extracts profile data from
        the transcript as a safety net).
        """
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
                logger.info(
                    "Call ended: call_id=%s duration=%ds segments=%d",
                    self.call_id,
                    duration,
                    len(self._transcript),
                )
            except Exception as e:
                logger.error("Failed to log call end: %s", e)
        else:
            logger.warning("Call ended without a call_id — transcript not saved")

    def get_caller_phone(self, room: rtc.Room) -> str | None:
        """Extract the caller's phone number from the SIP participant identity."""
        for p in room.remote_participants.values():
            if p.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP:
                identity = p.identity
                if identity.startswith("sip:"):
                    return identity.split("@")[0].replace("sip:", "")
                if identity.startswith("+"):
                    return identity
                return identity
        return None


def setup_transcript_listeners(
    session: AgentSession,
    call_handler: CallHandler,
):
    """Wire up AgentSession events to stream transcripts to Convex in real-time.

    Uses the 'conversation_item_added' event which fires for both user and
    assistant messages with a ChatMessage containing role and content.
    """

    @session.on("conversation_item_added")
    def on_conversation_item(ev):
        item = ev.item
        # Only capture user (caller) and assistant (agent) messages
        if item.role not in ("user", "assistant"):
            return
        text = item.text_content
        if not text:
            return
        speaker = "caller" if item.role == "user" else "agent"
        asyncio.create_task(
            call_handler.on_transcript_segment(speaker=speaker, text=text)
        )
