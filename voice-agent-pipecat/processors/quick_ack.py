"""Quick acknowledgment processor — plays cached filler audio within ~200ms.

When the user stops speaking, this processor immediately injects pre-cached
TTS audio ("Mm.", "Got it.", etc.) directly into the transport output,
bypassing the LLM→TTS chain entirely. The LLM processes in parallel.
"""

import asyncio
import logging
import random
import time
from typing import Dict, Optional

from pipecat.frames.frames import (
    Frame,
    UserStoppedSpeakingFrame,
    TTSAudioRawFrame,
    LLMFullResponseStartFrame,
)
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

logger = logging.getLogger("quick-ack")

QUICK_ACK_PHRASES = ["Mm.", "Mhm.", "Got it.", "Okay.", "Yeah."]


class QuickAckProcessor(FrameProcessor):
    """Injects cached filler audio when user stops speaking."""

    def __init__(self, phrases: list[str] | None = None):
        super().__init__()
        self._phrases = phrases or QUICK_ACK_PHRASES
        self._enabled = True
        self._last_ack_time = 0.0
        self._debounce_secs = 1.0
        self._transport_output = None
        self._cached_audio: Dict[str, bytes] = {}
        self._sample_rate = 16000

    def set_transport_output(self, transport_output):
        """Store direct reference to transport output for audio injection."""
        self._transport_output = transport_output

    def set_cached_audio(self, cache: Dict[str, bytes], sample_rate: int = 16000):
        """Set pre-generated audio cache."""
        self._cached_audio = cache
        self._sample_rate = sample_rate
        logger.info("Quick ack cache loaded: %d phrases", len(cache))

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Intercept UserStoppedSpeakingFrame to inject quick ack."""
        await super().process_frame(frame, direction)

        if (
            isinstance(frame, UserStoppedSpeakingFrame)
            and self._enabled
            and self._cached_audio
            and self._transport_output
        ):
            now = time.time()
            if now - self._last_ack_time >= self._debounce_secs:
                self._last_ack_time = now
                phrase = random.choice(list(self._cached_audio.keys()))
                audio_data = self._cached_audio[phrase]
                logger.debug("Quick ack: '%s'", phrase)
                await self._inject_audio(audio_data)

        # Always pass the frame downstream
        await self.push_frame(frame, direction)

    async def _inject_audio(self, audio_data: bytes):
        """Inject raw audio directly into transport output."""
        audio_frame = TTSAudioRawFrame(
            audio=audio_data,
            sample_rate=self._sample_rate,
            num_channels=1,
        )
        await self._transport_output.process_frame(
            audio_frame, FrameDirection.DOWNSTREAM
        )


async def generate_audio_cache(
    tts_service, phrases: list[str]
) -> Dict[str, bytes]:
    """Pre-generate TTS audio for quick ack phrases at startup."""
    cache: Dict[str, bytes] = {}

    for phrase in phrases:
        try:
            audio = b""
            async for chunk in tts_service.run_tts(phrase):
                if hasattr(chunk, "audio"):
                    audio += chunk.audio
                elif isinstance(chunk, bytes):
                    audio += chunk
            if audio:
                cache[phrase] = audio
                logger.info("Cached audio for '%s' (%d bytes)", phrase, len(audio))
        except Exception as e:
            logger.warning("Failed to cache '%s': %s", phrase, e)

    if not cache:
        logger.warning("No audio cached — generating placeholder silence")
        cache = _create_placeholder_cache(phrases)

    return cache


def _create_placeholder_cache(
    phrases: list[str], sample_rate: int = 16000
) -> Dict[str, bytes]:
    """Generate silent placeholder audio for testing."""
    cache = {}
    for phrase in phrases:
        num_samples = int(sample_rate * 0.2)  # 200ms of silence
        cache[phrase] = b"\x00\x00" * num_samples
    return cache
