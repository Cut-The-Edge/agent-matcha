# Pipecat Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Club Allenby voice intake agent from LiveKit to Pipecat with local WebRTC testing, targeting ~1.1s response time.

**Architecture:** Pipecat pipeline with Deepgram STT → Gemini LLM → Cartesia TTS, plus a QuickAckProcessor that plays cached filler audio within 200ms of user stopping. Local testing via SmallWebRTCTransport at localhost:7860.

**Tech Stack:** pipecat-ai (with deepgram, google, cartesia, silero, webrtc plugins), Python 3.11+, httpx for Convex HTTP calls.

**Spec:** `docs/superpowers/specs/2026-03-20-pipecat-migration-design.md`

**Reference codebase:** `/Users/adialia/Desktop/archive/telmi-core/pipecat-deployment/universal-agent/`

---

## File Structure

```
voice-agent-pipecat/
├── local_bot.py              # Entry point — SmallWebRTC local dev
├── matcha_agent.py           # Pipeline assembly, greeting, tool handlers
├── persona.py                # System prompt + LLM model config (copy from LiveKit)
├── flows/
│   ├── __init__.py
│   └── intake.py             # Context blocks (copy from LiveKit)
├── services.py               # Provider factory (Deepgram, Gemini, Cartesia)
├── processors/
│   ├── __init__.py
│   ├── quick_ack.py          # Pre-cached audio injection
│   ├── guardrails.py         # Hostile detection, silence/duration timers
│   └── transcript.py         # Convex transcript streaming
├── tools.py                  # LLM function tool definitions + handlers
├── convex_client.py          # HTTP client (copy from LiveKit agent)
├── requirements.txt
└── .env
```

---

### Task 1: Scaffold project and install dependencies

**Files:**
- Create: `voice-agent-pipecat/requirements.txt`
- Create: `voice-agent-pipecat/.env`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p /Users/adialia/Desktop/agent-matcha/voice-agent-pipecat/processors
mkdir -p /Users/adialia/Desktop/agent-matcha/voice-agent-pipecat/flows
```

- [ ] **Step 2: Create requirements.txt**

```
pipecat-ai[deepgram,google,cartesia,silero,webrtc]==0.0.84
python-dotenv~=1.0.1
httpx>=0.27.0
aiohttp>=3.8.0
```

- [ ] **Step 3: Create .env with existing keys**

Copy API keys from `voice-agent/.env`:

```
GOOGLE_API_KEY=<from voice-agent/.env>
DEEPGRAM_API_KEY=<from voice-agent/.env>
CARTESIA_API_KEY=<from voice-agent/.env>
CONVEX_URL=<from voice-agent/.env>
TWILIO_ACCOUNT_SID=<from voice-agent/.env>
TWILIO_AUTH_TOKEN=<from voice-agent/.env>
TWILIO_SIP_TRUNK_SID=<from voice-agent/.env>
TWILIO_PHONE_NUMBER=<from voice-agent/.env>
```

- [ ] **Step 4: Create virtual env and install**

```bash
cd /Users/adialia/Desktop/agent-matcha/voice-agent-pipecat
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

- [ ] **Step 5: Create empty __init__.py files**

```bash
touch processors/__init__.py flows/__init__.py
```

- [ ] **Step 6: Commit**

```bash
git add voice-agent-pipecat/
git commit -m "feat(pipecat): scaffold project with dependencies"
```

---

### Task 2: Copy reusable files from LiveKit agent

**Files:**
- Create: `voice-agent-pipecat/convex_client.py` (copy from `voice-agent/convex_client.py`)
- Create: `voice-agent-pipecat/persona.py` (copy from `voice-agent/persona.py`)
- Create: `voice-agent-pipecat/flows/intake.py` (copy from `voice-agent/flows/intake.py`)

- [ ] **Step 1: Copy convex_client.py as-is**

```bash
cp voice-agent/convex_client.py voice-agent-pipecat/convex_client.py
```

No changes needed — pure HTTP client, no LiveKit dependencies.

- [ ] **Step 2: Copy persona.py, update model name**

Copy `voice-agent/persona.py` to `voice-agent-pipecat/persona.py`. Change the LLM_MODEL line:

```python
# Gemini via Google LLM Service — ~470ms TTFT
LLM_MODEL = "gemini-2.5-flash-lite"
```

Everything else (SYSTEM_PROMPT, PHASE_2_DEEP_DIVE_ADDENDUM, INBOUND_GREETING_INSTRUCTIONS) stays identical.

- [ ] **Step 3: Copy flows/intake.py as-is**

```bash
cp voice-agent/flows/intake.py voice-agent-pipecat/flows/intake.py
cp voice-agent/flows/__init__.py voice-agent-pipecat/flows/__init__.py
```

No changes needed — pure string constants, no framework dependencies.

- [ ] **Step 4: Commit**

```bash
git add voice-agent-pipecat/
git commit -m "feat(pipecat): copy reusable files from LiveKit agent"
```

---

### Task 3: Create services.py — provider factory

**Files:**
- Create: `voice-agent-pipecat/services.py`

**Reference:** `/Users/adialia/Desktop/archive/telmi-core/pipecat-deployment/universal-agent/services/service_factory.py`

- [ ] **Step 1: Create services.py**

```python
"""Provider factory — creates Deepgram STT, Gemini LLM, and Cartesia TTS services."""

import os
from pipecat.services.deepgram.stt import DeepgramSTTService, LiveOptions
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.transcriptions.language import Language

from persona import LLM_MODEL


def create_stt() -> DeepgramSTTService:
    """Deepgram Nova-3 with aggressive latency settings."""
    return DeepgramSTTService(
        api_key=os.environ["DEEPGRAM_API_KEY"],
        live_options=LiveOptions(
            model="nova-3-general",
            language=Language.EN,
            smart_format=False,        # prevents 3s stalls
            punctuate=False,
            interim_results=True,
            vad_events=False,          # prevents finalize latency spikes
            endpointing=300,           # 300ms — proven in telmi-core
            no_delay=True,
            filler_words=True,
        ),
    )


def create_llm() -> GoogleLLMService:
    """Gemini 2.5 Flash Lite — no thinking, fast TTFT."""
    return GoogleLLMService(
        api_key=os.environ["GOOGLE_API_KEY"],
        model=LLM_MODEL,
        params=GoogleLLMService.InputParams(
            temperature=0.7,
            max_tokens=1000,
        ),
    )


def create_tts() -> CartesiaTTSService:
    """Cartesia Sonic 3 with the Matcha voice."""
    return CartesiaTTSService(
        api_key=os.environ["CARTESIA_API_KEY"],
        voice_id="e07c00bc-4134-4eae-9ea4-1a55fb45746b",
        model_id="sonic-3",
        params=CartesiaTTSService.InputParams(
            language=Language.EN,
        ),
    )
```

- [ ] **Step 2: Verify imports work**

```bash
cd voice-agent-pipecat && source venv/bin/activate
python3 -c "from services import create_stt, create_llm, create_tts; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add voice-agent-pipecat/services.py
git commit -m "feat(pipecat): add provider factory for Deepgram, Gemini, Cartesia"
```

---

### Task 4: Create processors/quick_ack.py — cached filler audio

**Files:**
- Create: `voice-agent-pipecat/processors/quick_ack.py`

**Reference:** `/Users/adialia/Desktop/archive/telmi-core/pipecat-deployment/universal-agent/processors/quick_ack_direct.py` and `/Users/adialia/Desktop/archive/telmi-core/pipecat-deployment/universal-agent/utils/audio_cache.py`

- [ ] **Step 1: Create processors/quick_ack.py**

```python
"""Quick acknowledgment processor — plays cached filler audio within ~200ms.

When the user stops speaking, this processor immediately injects pre-cached
TTS audio ("Mm.", "Got it.", etc.) directly into the transport output,
bypassing the LLM→TTS chain entirely. The LLM processes in parallel.
"""

import asyncio
import logging
import random
import struct
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
```

- [ ] **Step 2: Verify import works**

```bash
python3 -c "from processors.quick_ack import QuickAckProcessor, generate_audio_cache; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add voice-agent-pipecat/processors/quick_ack.py
git commit -m "feat(pipecat): add QuickAckProcessor with cached filler audio"
```

---

### Task 5: Create processors/transcript.py — Convex transcript streaming

**Files:**
- Create: `voice-agent-pipecat/processors/transcript.py`

- [ ] **Step 1: Create processors/transcript.py**

```python
"""Transcript processor — streams speech segments to Convex in real-time."""

import asyncio
import logging

from pipecat.frames.frames import Frame, TranscriptionFrame, TextFrame
from pipecat.processors.frame_processor import FrameProcessor, FrameDirection

from convex_client import ConvexClient

logger = logging.getLogger("transcript")


class TranscriptProcessor(FrameProcessor):
    """Captures STT and LLM output, streams to Convex."""

    def __init__(self, convex: ConvexClient, call_id_getter):
        super().__init__()
        self._convex = convex
        self._get_call_id = call_id_getter  # callable that returns current call_id
        self._transcript: list[dict] = []

    @property
    def transcript(self) -> list[dict]:
        return self._transcript

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, TranscriptionFrame) and frame.text:
            # User speech from STT
            await self._save_segment("caller", frame.text)
        elif isinstance(frame, TextFrame) and frame.text and direction == FrameDirection.DOWNSTREAM:
            # Agent speech from LLM (before TTS)
            await self._save_segment("agent", frame.text)

        await self.push_frame(frame, direction)

    async def _save_segment(self, speaker: str, text: str):
        import time

        segment = {
            "speaker": speaker,
            "text": text,
            "timestamp": time.time(),
        }
        self._transcript.append(segment)

        call_id = self._get_call_id()
        if call_id:
            try:
                await self._convex.add_transcript_segment(
                    call_id=call_id,
                    speaker=speaker,
                    text=text,
                    timestamp=segment["timestamp"],
                )
            except Exception as e:
                logger.warning("Failed to stream transcript segment: %s", e)
```

- [ ] **Step 2: Commit**

```bash
git add voice-agent-pipecat/processors/transcript.py
git commit -m "feat(pipecat): add transcript processor for Convex streaming"
```

---

### Task 6: Create processors/guardrails.py — hostile/silence/duration detection

**Files:**
- Create: `voice-agent-pipecat/processors/guardrails.py`

- [ ] **Step 1: Create processors/guardrails.py**

Port the guardrail logic from `voice-agent/agent.py` (the `_HOSTILE_PATTERNS`, `_is_hostile()`, silence watchdog, duration watchdog) into a single Pipecat `FrameProcessor`.

The processor watches for `TranscriptionFrame` (user speech) to:
- Check hostile language patterns (same regex list from LiveKit agent)
- Reset silence timer on each user utterance
- Track call duration with 35min/43min/45min warnings

Key difference from LiveKit: instead of `session.generate_reply(instructions=...)`, inject an `LLMMessagesFrame` into the pipeline to trigger the LLM.

Reference: `voice-agent/agent.py` lines 57-106 (hostile patterns) and lines 600-755 (silence/duration watchdogs).

The full implementation should mirror the LiveKit guardrails but use Pipecat frame types. This is the most complex processor — see the spec for details on the 2-strike hostile policy, 10s silence threshold, and 3-stage duration management.

- [ ] **Step 2: Commit**

```bash
git add voice-agent-pipecat/processors/guardrails.py
git commit -m "feat(pipecat): add guardrail processor (hostile/silence/duration)"
```

---

### Task 7: Create tools.py — LLM function tool definitions and handlers

**Files:**
- Create: `voice-agent-pipecat/tools.py`

- [ ] **Step 1: Create tools.py**

Define all 7 tools as OpenAI function-calling schema dicts, plus async handler functions that call ConvexClient. Each tool handler receives the function call arguments and returns a result.

Reference: `voice-agent/agent.py` lines 141-598 for the tool definitions and their parameters.

Tools to port:
1. `save_intake_data` — 50+ optional string params, calls `convex.save_intake_data()`
2. `send_data_request_link` — no params, calls `convex.send_data_request()`
3. `transfer_call` — `transfer_to: str`, SIP transfer (stub for local, real for Daily)
4. `end_call` — no params, ends the pipeline
5. `start_deep_dive` — no params, appends Phase 2 instructions to context
6. `save_deep_dive_data` — matchmaker_note + personality tags, calls `convex.save_deep_dive_data()`
7. `transfer_to_human` — no params, ends pipeline (escalation)

The tool definitions list is registered on `OpenAILLMContext(messages, tools=tool_definitions)`.

Tool handlers are registered on the LLM service via:
```python
llm.register_function("save_intake_data", handle_save_intake_data)
llm.register_function("end_call", handle_end_call)
# ... etc
```

- [ ] **Step 2: Commit**

```bash
git add voice-agent-pipecat/tools.py
git commit -m "feat(pipecat): add LLM function tool definitions and handlers"
```

---

### Task 8: Create matcha_agent.py — main pipeline assembly

**Files:**
- Create: `voice-agent-pipecat/matcha_agent.py`

**Reference:** `/Users/adialia/Desktop/archive/telmi-core/pipecat-deployment/universal-agent/core/agent_dynamic.py` (lines 900-1050) and `core/pipeline_builder.py`

- [ ] **Step 1: Create matcha_agent.py**

This is the main file. It:
1. Creates all services via `services.py`
2. Creates the LLM context with system prompt + tools
3. Builds the pipeline in the correct order
4. Sets up the QuickAckProcessor with cached audio
5. Starts the pipeline runner
6. Sends the greeting

Key pipeline assembly pattern:
```python
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.task import PipelineTask, PipelineParams
from pipecat.pipeline.runner import PipelineRunner
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext
from pipecat.processors.aggregators.llm_response import LLMUserAggregatorParams
from pipecat.frames.frames import TTSSpeakFrame, EndFrame
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

# ... create stt, llm, tts via services.py ...

# LLM context with system prompt and tools
context = OpenAILLMContext(
    [{"role": "system", "content": system_prompt}],
    tools=tool_definitions,
)
user_agg_params = LLMUserAggregatorParams(aggregation_timeout=0.1)
context_aggregator = llm.create_context_aggregator(context, user_params=user_agg_params)

# Pipeline in order
pipeline = Pipeline([
    transport.input(),
    stt,
    quick_ack_processor,
    guardrail_processor,
    transcript_processor,
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
    ),
)

# Send greeting after pipeline starts
await task.queue_frames([TTSSpeakFrame(greeting_text)])

# Run
runner = PipelineRunner()
await runner.run(task)
```

The file also handles:
- Phone lookup via ConvexClient (same as LiveKit agent entrypoint)
- Building member context (same `_build_member_context` function)
- Caller status detection (existing/new/unknown)
- Dynamic greeting based on caller status
- Registering tool handlers on the LLM
- Generating quick ack audio cache in background at startup

- [ ] **Step 2: Commit**

```bash
git add voice-agent-pipecat/matcha_agent.py
git commit -m "feat(pipecat): add main agent with pipeline assembly"
```

---

### Task 9: Create local_bot.py — local WebRTC entry point

**Files:**
- Create: `voice-agent-pipecat/local_bot.py`

- [ ] **Step 1: Create local_bot.py**

```python
"""Local development entry point — test via browser at localhost:7860."""

import asyncio
import logging

from dotenv import load_dotenv
from pipecat.runner.types import RunnerArguments, SmallWebRTCRunnerArguments
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.network.small_webrtc import SmallWebRTCTransport
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams

load_dotenv()

logging.basicConfig(level=logging.INFO)


async def bot(runner_args: RunnerArguments):
    """Entry point called by Pipecat dev runner."""
    if not isinstance(runner_args, SmallWebRTCRunnerArguments):
        raise ValueError(f"Expected SmallWebRTCRunnerArguments, got {type(runner_args)}")

    transport = SmallWebRTCTransport(
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(
                stop_secs=0.3,
                start_secs=0.1,
                min_volume=0.5,
            )),
            vad_audio_passthrough=True,
            audio_in_sample_rate=16000,
            audio_out_sample_rate=24000,
        ),
        webrtc_connection=runner_args.webrtc_connection,
    )

    from matcha_agent import run_agent
    await run_agent(transport)


if __name__ == "__main__":
    from pipecat.runner.run import main
    main()
```

- [ ] **Step 2: Test local startup**

```bash
cd voice-agent-pipecat && source venv/bin/activate
python3 local_bot.py
```

Expected: Server starts at `http://localhost:7860`. Open `/client` in browser, click Connect, talk to the agent.

- [ ] **Step 3: Commit**

```bash
git add voice-agent-pipecat/local_bot.py
git commit -m "feat(pipecat): add local WebRTC entry point"
```

---

### Task 10: Integration test — end-to-end local call

- [ ] **Step 1: Start the agent locally**

```bash
cd voice-agent-pipecat && source venv/bin/activate
python3 local_bot.py
```

- [ ] **Step 2: Open browser and test**

Open `http://localhost:7860/client`. Click Connect. Say "Hey". Verify:
- Agent greets you within ~1-2 seconds
- You hear a quick ack ("Mm.", "Got it.") before the full response
- Agent asks you questions naturally
- Agent follows the persona (warm, casual, one question at a time)

- [ ] **Step 3: Test tool calling**

Have a short conversation, then say "I need to go." Verify:
- Agent says goodbye
- Agent calls `save_intake_data` (check Convex logs or agent stdout)
- Agent calls `end_call` (pipeline ends)

- [ ] **Step 4: Commit any fixes**

```bash
git add -A voice-agent-pipecat/
git commit -m "feat(pipecat): integration fixes from local testing"
```
