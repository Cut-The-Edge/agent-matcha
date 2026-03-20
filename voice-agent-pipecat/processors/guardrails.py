"""Guardrails processor — hostile language detection, silence watchdog, duration limits.

Ported from the LiveKit agent's guardrail logic. Sits in the pipeline between
STT and the LLM context aggregator to intercept user speech and enforce
safety / cost-control policies.
"""

import asyncio
import logging
import re
import time
from typing import Callable, Awaitable

from pipecat.frames.frames import Frame, TranscriptionFrame, LLMMessagesFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

logger = logging.getLogger("guardrails")

# ── Hostile language patterns ────────────────────────────────────────────
# Exact copy from the LiveKit agent. Matched case-insensitively.

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

# ── Guardrail constants ─────────────────────────────────────────────────

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


def _is_hostile(text: str) -> bool:
    """Return True if the text matches any hostile language pattern."""
    return any(pat.search(text) for pat in _HOSTILE_PATTERNS)


class GuardrailProcessor(FrameProcessor):
    """Enforces hostile-language, silence, and duration guardrails.

    Sits in the pipeline after STT. When a guardrail triggers, it queues
    an LLMMessagesFrame into the pipeline task so the LLM generates an
    appropriate response.

    Args:
        on_force_end: Async callback invoked when the hard duration limit
            is reached (45 min). The caller should save data and disconnect.
        call_start_time: Epoch timestamp of when the call started. If not
            provided, defaults to the time the processor is created.
    """

    def __init__(
        self,
        on_force_end: Callable[[], Awaitable[None]],
        call_start_time: float | None = None,
    ):
        super().__init__()
        self._on_force_end = on_force_end
        self._call_start_time = call_start_time or time.time()

        # PipelineTask reference — set after pipeline construction
        self._task = None

        # Hostile language: 2-strike policy
        self._hostile_strikes = 0

        # Silence watchdog state
        self._silence_timer_task: asyncio.Task | None = None
        self._silence_prompted = False

        # Duration watchdog state
        self._duration_task: asyncio.Task | None = None
        self._duration_warned = False
        self._final_warned = False

    def set_task(self, task):
        """Store reference to the PipelineTask for queuing frames."""
        self._task = task

    def start_watchdogs(self):
        """Start the silence and duration watchdog tasks.

        Call this after set_task() once the pipeline is running.
        """
        self._reset_silence_timer()
        self._duration_task = asyncio.create_task(self._duration_watchdog())
        logger.info("[guardrails] Watchdogs started")

    def cancel_watchdogs(self):
        """Cancel all active watchdog tasks (call on disconnect)."""
        if self._silence_timer_task and not self._silence_timer_task.done():
            self._silence_timer_task.cancel()
            self._silence_timer_task = None
        if self._duration_task and not self._duration_task.done():
            self._duration_task.cancel()
            self._duration_task = None
        logger.info("[guardrails] Watchdogs cancelled")

    # ── Frame processing ─────────────────────────────────────────────────

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Intercept user speech to check guardrails."""
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame):
            text = frame.text.strip() if frame.text else ""
            if text:
                # Reset silence timer on any user speech
                self._reset_silence_timer()

                # Check hostile language
                if _is_hostile(text):
                    await self._handle_hostile(text)

        # Always pass frame downstream unchanged
        await self.push_frame(frame, direction)

    # ── Hostile language handling ─────────────────────────────────────────

    async def _handle_hostile(self, text: str):
        """2-strike hostile language policy."""
        self._hostile_strikes += 1
        logger.warning(
            "[guardrail:hostile] Strike %d — text: %s",
            self._hostile_strikes,
            text[:100],
        )

        if self._hostile_strikes == 1:
            # First strike: de-escalation
            await self._queue_system_message(
                "The caller just used hostile or abusive language. "
                "Stay calm and professional. Acknowledge their frustration "
                "with empathy: 'I understand this might be frustrating — "
                "I'm here to help. Let's keep the conversation going so I can "
                "assist you.' Do NOT mirror their tone or escalate."
            )
        else:
            # Second strike: transfer / end
            await self._queue_system_message(
                "The caller has been hostile again (second strike). "
                "Say: 'I want to make sure you get the best help possible. "
                "Let me connect you with a team member who can assist you directly.' "
                "Then call transfer_call or end_call."
            )

    # ── Silence watchdog ─────────────────────────────────────────────────

    def _reset_silence_timer(self):
        """Reset the silence detection timer — called on every user utterance."""
        if self._silence_timer_task and not self._silence_timer_task.done():
            self._silence_timer_task.cancel()
        self._silence_prompted = False
        self._silence_timer_task = asyncio.create_task(self._silence_watchdog())

    async def _silence_watchdog(self):
        """Background task: wait for silence threshold, then prompt."""
        try:
            await asyncio.sleep(_SILENCE_THRESHOLD_SECS)
            # No user speech for _SILENCE_THRESHOLD_SECS — prompt them
            logger.info(
                "[guardrail:silence] No speech for %ds — prompting caller",
                int(_SILENCE_THRESHOLD_SECS),
            )
            self._silence_prompted = True
            await self._queue_system_message(
                "The caller has been silent for a while. "
                "Say: 'Hey, are you still there?' in a warm, checking-in tone. "
                "Wait for a response."
            )

            # Wait another interval — if still silent, gracefully end
            await asyncio.sleep(_SILENCE_AFTER_PROMPT_SECS)
            logger.info(
                "[guardrail:silence] Still silent after prompt — ending call gracefully"
            )
            await self._queue_system_message(
                "The caller is still silent after your check-in. "
                "Say: 'Looks like I might have lost you. I'll save everything "
                "we've covered so far — feel free to call back anytime!' "
                "Then call save_intake_data with whatever data you have, "
                "followed by end_call."
            )

        except asyncio.CancelledError:
            pass  # Timer was reset or call ended — this is normal

    # ── Duration watchdog ────────────────────────────────────────────────

    async def _duration_watchdog(self):
        """Background task: three-stage duration management.

        Stage 1 (35 min): "10 minutes left" — wrap up current topic
        Stage 2 (43 min): "2 minutes left" — say goodbye NOW
        Stage 3 (45 min): Hard cut — force save and end the call
        """
        try:
            # ── Stage 1: Wrap-up warning at 35 minutes ──
            remaining = _WRAP_UP_WARNING_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            if not self._duration_warned:
                self._duration_warned = True
                logger.info("[guardrail:duration] 35-min mark — 10 minutes left")
                await self._queue_system_message(
                    "IMPORTANT: You have about 10 minutes left on this call. "
                    "Start wrapping up — prioritize the most important "
                    "missing fields. Say something like: 'We're covering great "
                    "ground! Let me just get a few more key things.' After "
                    "collecting those, call save_intake_data."
                )

            # ── Stage 2: Final warning at 43 minutes ──
            remaining = _FINAL_WARNING_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            if not self._final_warned:
                self._final_warned = True
                logger.info("[guardrail:duration] 43-min mark — 2 minutes left")
                await self._queue_system_message(
                    "URGENT: The call is about to end in 2 minutes. "
                    "Stop asking questions NOW. Say a warm goodbye: "
                    "'It was really great chatting with you! Dani will review "
                    "everything and be in touch soon. Take care!' "
                    "Then IMMEDIATELY call save_intake_data with everything "
                    "you have, and call end_call. Do NOT ask anything else."
                )

            # ── Stage 3: Hard cut at 45 minutes ──
            remaining = _HARD_LIMIT_SECS - (time.time() - self._call_start_time)
            if remaining > 0:
                await asyncio.sleep(remaining)

            logger.warning("[guardrail:duration] 45-min HARD LIMIT — force ending call")
            self.cancel_watchdogs()
            await self._on_force_end()

        except asyncio.CancelledError:
            pass  # Call ended before limit — this is normal

    # ── Helpers ──────────────────────────────────────────────────────────

    async def _queue_system_message(self, content: str):
        """Queue a system message into the pipeline via the task."""
        if not self._task:
            logger.warning(
                "[guardrails] Cannot queue message — task not set. "
                "Call set_task() before start_watchdogs()."
            )
            return

        messages = [{"role": "system", "content": content}]
        await self._task.queue_frames([LLMMessagesFrame(messages)])
