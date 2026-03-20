# Pipecat Migration Design — Agent Matcha Voice Agent

**Date:** 2026-03-20
**Status:** Approved
**Goal:** Migrate the Club Allenby voice intake agent from LiveKit Agents to Pipecat for lower latency. Target: ~1.1s response time matching the proven telmi-core Pipecat agent.

---

## Why Migrate

The LiveKit Agents SDK introduced persistent latency issues (4-7s response times) despite extensive tuning. The same providers (Deepgram, Gemini, Cartesia) achieved ~1.1s response time in the telmi-core Pipecat agent due to:

1. **QuickAckProcessor** — pre-cached filler audio injected in ~200ms, bypassing LLM+TTS
2. **Explicit pipeline control** — processors ordered for minimum latency
3. **Aggressive VAD/endpointing** — 300ms proven stable in production
4. **100ms LLM aggregation timeout** — forward input to LLM immediately

---

## Architecture

### File Structure

```
voice-agent-pipecat/
├── local_bot.py              # Entry point — local WebRTC testing
├── matcha_agent.py           # Main agent class, pipeline setup, entrypoint
├── persona.py                # System prompt (ported from LiveKit agent)
├── flows/
│   ├── __init__.py
│   └── intake.py             # Context blocks (ported as-is from LiveKit)
├── services.py               # Provider factory (Deepgram, Gemini, Cartesia)
├── processors/
│   ├── __init__.py
│   ├── quick_ack.py          # Pre-cached audio injection (~200ms response)
│   ├── guardrails.py         # Hostile detection, silence timer, duration limit
│   └── transcript.py         # Convex transcript streaming
├── tools.py                  # LLM function tools (save_intake_data, end_call, etc.)
├── convex_client.py          # HTTP client for Convex backend (reused from LiveKit)
├── requirements.txt
└── .env
```

### Pipeline Order

```
Transport Input
  → Deepgram STT
    → QuickAckProcessor (EARLY — catches VAD before LLM)
      → GuardrailProcessor (hostile detection, silence timer)
        → TranscriptProcessor (streams to Convex)
          → LLM Context Aggregator (user)
            → Gemini LLM
              → Cartesia TTS
                → Transport Output
                  → LLM Context Aggregator (assistant)
```

QuickAckProcessor is placed early so it sees `UserStoppedSpeakingFrame` before other processors can delay it. It injects cached audio directly into the transport output, bypassing the entire LLM→TTS chain.

---

## Component Mapping (LiveKit → Pipecat)

| LiveKit | Pipecat | Notes |
|---------|---------|-------|
| `AgentSession` + providers | `PipelineTask` + processor chain | Explicit pipeline |
| `MatchaAgent(Agent)` | `matcha_agent.py` pipeline setup | Functions, not class inheritance |
| `@function_tool()` | `OpenAILLMContext` tool definitions | Same OpenAI function schema |
| `session.generate_reply()` | `task.queue_frames([LLMMessagesFrame])` | Inject into pipeline |
| Silence/duration watchdogs | `GuardrailProcessor(FrameProcessor)` | Custom processor |
| `setup_transcript_listeners` | `TranscriptProcessor(FrameProcessor)` | Catches transcription frames |
| `call_handler.py` | `convex_client.py` (reused) | HTTP calls identical |
| `persona.py` | `persona.py` (copied) | Same system prompt |
| `flows/intake.py` | `flows/intake.py` (copied) | Context blocks are strings |
| `MultilingualModel()` turn detection | Silero VAD + Deepgram endpointing | No separate turn model |
| No quick ack | `QuickAckProcessor` | **The big latency win** |

---

## Provider Settings

### Deepgram STT
- Model: `nova-3`
- Endpointing: `300ms`
- `smart_format=False` — prevents 3s stalls on incomplete entities
- `vad_events=False` — prevents finalize latency spikes
- `no_delay=True` — immediate results
- `interim_results=True`
- `filler_words=True`
- 11 keyterms: Club Allenby, Dani Bergman, Matcha, Ashkenazi, Sephardic, Mizrachi, Conservadox, Modern Orthodox, Shabbat, Shabbos, kosher

### Gemini LLM
- Model: `gemini-2.5-flash-lite` (direct Google API)
- Temperature: `0.7`
- Max tokens: `1000`

### Cartesia TTS
- Model: `sonic-3`
- Voice: `e07c00bc-4134-4eae-9ea4-1a55fb45746b`
- Speed: normal

### Silero VAD
- Stop duration: `0.3s` (300ms)
- Start duration: `0.1s` (100ms)
- Min volume: `0.6`
- `vad_audio_passthrough=True`

### LLM Aggregation
- `aggregation_timeout=0.1` (100ms)

---

## QuickAckProcessor

The single biggest latency optimization. Pre-generates TTS audio at startup for short phrases, then injects them directly into the transport when VAD detects user stopped speaking.

**Phrases:** `["Mm.", "Mhm.", "Got it.", "Okay.", "Yeah."]`

**Flow:**
1. Agent starts → generate TTS audio for each phrase via Cartesia API
2. User speaks → VAD detects `UserStoppedSpeakingFrame`
3. QuickAckProcessor immediately injects cached audio into transport output (~200ms)
4. Meanwhile, STT finalizes → LLM generates → TTS synthesizes full response
5. User hears "Mm." instantly, then the real response follows

**Debounce:** 1.0s between acks to prevent spam.

---

## Function Tools (7 tools)

All registered on the `OpenAILLMContext` with standard OpenAI function-calling schema:

1. **save_intake_data** — save 50+ profile fields to Convex
2. **send_data_request_link** — send WhatsApp form link
3. **transfer_call** — SIP transfer to Dani/Jane (disabled in local/WebRTC mode)
4. **end_call** — graceful disconnect after goodbye + data save
5. **start_deep_dive** — activate Phase 2 instructions
6. **save_deep_dive_data** — save Phase 2 insights
7. **transfer_to_human** — escalation transfer

Tool handlers call the same `ConvexClient` HTTP methods.

---

## Guardrails

Ported as a single `GuardrailProcessor(FrameProcessor)`:

- **Hostile language detection** — same regex patterns, 2-strike policy
- **Silence detection** — 10s threshold → prompt, 10s more → disconnect
- **Duration limit** — 45min hard cap with 35min/43min/45min warnings
- **Off-topic tracking** — counter for consecutive off-topic turns

---

## Local Testing

```bash
cd voice-agent-pipecat
pip install -r requirements.txt
python3 local_bot.py
# Browser opens at http://localhost:7860/client
# Click Connect → talk via microphone
```

Uses `SmallWebRTCTransport` — pure WebRTC, no Daily.co account, no SIP, no Twilio.

**Environment (`.env`):**
```
GOOGLE_API_KEY=...
DEEPGRAM_API_KEY=...
CARTESIA_API_KEY=...
CONVEX_URL=...
```

---

## Future: SIP + Deployment

Not in scope for this build, but the path forward:

1. **Daily.co SIP** — add `DailyTransport` with `DailyParams`, route Twilio SIP trunk to Daily
2. **Pipecat Cloud** — change entry point to `pipecatcloud.agent.PipecatSessionArguments`, deploy via `pipecat-cloud deploy`
3. **Self-host** — Dockerfile with `python3 bot.py` entrypoint

---

## Expected Latency Budget

| Component | Time | Notes |
|-----------|------|-------|
| User stops speaking | 0ms | baseline |
| VAD detects silence | ~50ms | 300ms buffer, detected early |
| **Quick ack heard** | **~200ms** | Cached audio, direct injection |
| Deepgram finalizes | ~150ms | Streaming, fast with endpointing=300 |
| LLM aggregation + TTFT | ~500-600ms | Gemini 2.5 Flash Lite |
| TTS first chunk | ~100-150ms | Cartesia sonic-3 streaming |
| Full response playing | ~800-1100ms | Depends on length |

**Perceived latency: ~200ms** (quick ack) + **~1.1s for full response**.
