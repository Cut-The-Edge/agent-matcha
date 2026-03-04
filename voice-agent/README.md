# Agent Matcha — Voice Intake Agent

AI-powered phone intake agent for Club Allenby, built on LiveKit Agents.

## Stack

- **LiveKit Agents** — voice pipeline framework
- **Deepgram Nova-2** — speech-to-text
- **OpenRouter** — LLM (GPT-4.1-mini via OpenAI-compatible API)
- **Cartesia Sonic** — text-to-speech
- **Silero VAD** — voice activity detection
- **Twilio** — SIP trunk for phone calls

## Setup

1. Install dependencies:
   ```bash
   cd voice-agent
   pip install -e .
   ```

2. Copy `.env.example` to `.env` and fill in your API keys.

3. Run the agent:
   ```bash
   python agent.py dev
   ```

## Architecture

```
Phone → Twilio SIP Trunk → LiveKit Cloud → Python Voice Agent
                                                ↓
                              Deepgram (STT) + OpenRouter (LLM) + Cartesia (TTS)
                                                ↓
                              Convex API (member lookup, call logging, SMA sync)
```

The agent runs as a LiveKit worker process. When a phone call arrives via SIP,
LiveKit dispatches it to the agent, which joins the room and handles the
conversation using the STT → LLM → TTS pipeline.

## Environment Variables

See `.env.example` for all required variables.
