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
