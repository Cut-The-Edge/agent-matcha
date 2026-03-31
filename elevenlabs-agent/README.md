# ElevenLabs Agent Configuration

This directory contains configuration for the ElevenLabs Conversational AI agent
that replaces the previous LiveKit-based voice agent.

## Setup

### 1. Create an ElevenLabs agent

1. Go to https://elevenlabs.io/conversational-ai
2. Create a new agent
3. Import the system prompt from `../voice-agent/persona.py`
4. Configure tools — use definitions from `tools.json` as reference
5. Choose a voice (ElevenLabs voices are superior to Cartesia)
6. Set LLM to Gemini 2.5 Flash or GPT-4o

### 2. Import your Twilio phone number

1. In ElevenLabs dashboard: Phone Numbers > Add
2. Select "Twilio" as provider
3. Enter your Twilio Account SID and Auth Token
4. Enter your phone number (+17869986661)
5. Assign the agent to the phone number
6. ElevenLabs auto-configures Twilio webhooks — no server needed!

### 3. Configure webhooks (for post-call processing)

1. In ElevenLabs dashboard: Settings > Webhooks
2. Add webhook URL: `https://your-app.com/api/elevenlabs-webhook`
3. Enable `post_call_transcription` event
4. This sends transcript + analysis to Convex after each call

### 4. Set environment variables

Add to `.env.local`:
```
ELEVENLABS_API_KEY=sk-...
NEXT_PUBLIC_ELEVENLABS_AGENT_ID=agent_...
ELEVENLABS_PHONE_NUMBER_ID=pn_...
```

The phone number ID is returned when you import your Twilio number
(via API: `POST /v1/convai/phone-numbers` or visible in the dashboard).

## Architecture

### Browser Sandbox
- Frontend uses `@11labs/react` `useConversation` hook
- Backend route `/api/elevenlabs-session` gets a signed WebSocket URL
- Tool calls handled client-side → proxy to Convex HTTP endpoints
- Transcripts streamed to Convex in real-time

### Phone Calls (Inbound)
- Twilio number imported into ElevenLabs
- ElevenLabs handles the entire call lifecycle
- Post-call webhook sends transcript to `/api/elevenlabs-webhook`
- Webhook forwards data to Convex for summary generation + CRM sync

### Phone Calls (Outbound)
- Dashboard calls `/api/outbound-call`
- Route calls ElevenLabs `POST /v1/convai/twilio/outbound-call`
- ElevenLabs places the call via Twilio and handles conversation
- Post-call webhook delivers transcript + analysis

## Optional: Bridge Server

The `server.js` file is a Twilio WebSocket bridge for advanced use cases
where you need direct control over the audio stream (e.g., custom STT,
real-time audio processing). For most use cases, the native Twilio
integration above is sufficient and simpler.
