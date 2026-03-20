"""Transcript processor — captures user and agent speech in real-time.

Listens for STT TranscriptionFrame (user speech) and LLM TextFrame (agent
speech), streams each segment to Convex via ConvexClient, and maintains
a local transcript list for call-end summaries.
"""

import asyncio
import logging
import time

from pipecat.frames.frames import Frame, TranscriptionFrame, TextFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

from convex_client import ConvexClient

logger = logging.getLogger("transcript")


class TranscriptProcessor(FrameProcessor):
    """Captures user + agent speech and streams segments to Convex."""

    def __init__(
        self,
        convex: ConvexClient,
        call_id_getter: callable,
    ):
        super().__init__()
        self._convex = convex
        self._call_id_getter = call_id_getter
        self._transcript: list[dict] = []
        self._agent_buffer: str = ""
        self._agent_buffer_task: asyncio.Task | None = None
        self._agent_flush_delay = 0.8  # seconds to wait before flushing agent text

    @property
    def transcript(self) -> list[dict]:
        """Return a copy of the accumulated transcript segments."""
        return list(self._transcript)

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Intercept transcription and text frames to log segments."""
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            # User speech from STT
            text = frame.text.strip() if frame.text else ""
            if text:
                await self._save_segment("caller", text)

        elif isinstance(frame, TextFrame) and direction == FrameDirection.DOWNSTREAM:
            # Agent speech from LLM — arrives as streaming tokens.
            # Buffer tokens and flush once the stream pauses.
            self._agent_buffer += frame.text or ""
            if self._agent_buffer_task and not self._agent_buffer_task.done():
                self._agent_buffer_task.cancel()
            self._agent_buffer_task = asyncio.create_task(
                self._flush_agent_buffer()
            )

        # Always pass frame downstream unchanged
        await self.push_frame(frame, direction)

    async def _flush_agent_buffer(self):
        """Wait for token stream to settle, then save the buffered agent text."""
        try:
            await asyncio.sleep(self._agent_flush_delay)
            text = self._agent_buffer.strip()
            self._agent_buffer = ""
            if text:
                await self._save_segment("agent", text)
        except asyncio.CancelledError:
            pass  # New tokens arrived — buffer will flush on next pause

    async def _save_segment(self, speaker: str, text: str):
        """Append to local transcript and stream to Convex."""
        ts = time.time()
        segment = {
            "speaker": speaker,
            "text": text,
            "timestamp": ts,
        }
        self._transcript.append(segment)
        logger.debug("[transcript] %s: %s", speaker, text[:80])

        call_id = self._call_id_getter()
        if call_id:
            try:
                await self._convex.add_transcript_segment(
                    call_id=call_id,
                    speaker=speaker,
                    text=text,
                    timestamp=ts,
                )
            except Exception:
                logger.warning(
                    "[transcript] Failed to stream segment to Convex",
                    exc_info=True,
                )
