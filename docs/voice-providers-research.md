# Voice AI Providers Research: Agent Matcha

> **Last Updated:** March 2, 2026
> **Purpose:** Comprehensive comparison of voice AI providers for building an AI phone intake agent for Club Allenby's matchmaking service.

---

## Table of Contents

1. [Provider Deep Dives](#provider-deep-dives)
   - [Pipecat](#1-pipecat)
   - [Retell AI](#2-retell-ai)
   - [Vapi AI](#3-vapi-ai)
   - [Bland AI](#4-bland-ai)
   - [LiveKit](#5-livekit)
   - [OpenAI Realtime API](#6-openai-realtime-api)
   - [Air AI](#7-air-ai)
   - [Vocode](#8-vocode)
2. [Pricing Comparison Table](#pricing-comparison-table)
3. [Build vs Buy Analysis](#build-vs-buy-analysis)
4. [Cost Optimization Strategies](#cost-optimization-strategies)
5. [WebRTC vs SIP](#webrtc-vs-sip)
6. [Recommended Stack for Agent Matcha](#recommended-stack-for-agent-matcha)
7. [Architecture Diagram](#architecture-diagram)

---

## Provider Deep Dives

### 1. Pipecat

**What it is:** An open-source Python framework (by Daily.co) for building real-time voice and multimodal conversational AI applications. It is NOT a managed service -- it is a toolkit you assemble yourself.

**How it works:** Pipeline-based architecture where you chain together STT, LLM, TTS, and transport components. You pick each provider independently. Pipecat orchestrates the audio streaming, turn detection, interruption handling, and pipeline flow.

**Pricing:**
- Framework itself: **FREE** (open-source, MIT license)
- **Pipecat Cloud** (managed hosting by Daily): $0.01/min per running agent
- You pay separately for each AI service you plug in:
  - STT: e.g., Deepgram Nova-3 at ~$0.0043-0.0077/min
  - LLM: e.g., GPT-4o-mini at ~$0.006/min, Claude Haiku at ~$0.01/min
  - TTS: e.g., Cartesia Sonic at ~$0.05/1K chars, Deepgram Aura at ~$0.015/1K chars
  - Transport: Daily WebRTC (free if using Pipecat Cloud) or self-hosted
  - Telephony: Twilio at ~$0.014/min outbound, $0.0085/min inbound
- **Estimated all-in cost: $0.04-0.10/min** depending on component choices

**Phone Calling Support:**
- Native telephony serializers for **Twilio**, **Telnyx**, **Plivo**, and **Exotel**
- SIP dial-in via Daily rooms
- Inbound and outbound PSTN calls supported
- DTMF handling supported

**WebRTC Support:**
- First-class WebRTC via Daily.co transport
- Browser-based calling fully supported
- Also supports raw WebSocket transport

**Ease of Integration:**
- Requires Python development skills
- Well-documented with many examples
- Pipeline concept is intuitive once understood
- Setup time: days to weeks for production
- Active community (9.5K+ GitHub stars)

**Features:**
- Interruption handling (built-in)
- End-to-end latency: 500-800ms typical
- Function calling support via LLM tools
- Voice Activity Detection (VAD) with Silero
- Krisp noise cancellation (bundled in Pipecat Cloud)
- Multi-modal support (audio + video + text)
- Call recording and transcription

**Limitations:**
- Requires significant engineering effort
- You manage infrastructure (unless using Pipecat Cloud)
- No built-in analytics dashboard
- No visual flow builder
- No built-in CRM integrations

---

### 2. Retell AI

**What it is:** A managed voice AI platform with a visual flow builder for creating phone agents. Emphasizes ease of use and fast deployment -- "go live in 3 minutes."

**How it works:** All-in-one platform where you configure agents via a dashboard or API. Retell handles orchestration, telephony, and hosting. You choose your LLM, voice, and telephony options within their platform.

**Pricing:**
- **Base platform fee:** $0.07+/min for AI Voice Agents (no separate platform fee)
- **LLM costs** (billed separately):
  - GPT-4o-mini: $0.006/min
  - GPT-4o: $0.05/min
  - Claude 3.5/3.7 Sonnet: $0.02-0.06/min
  - Gemini 2.0 Flash: $0.006/min
- **Voice models:**
  - Standard voices: $0.03-0.05/min
  - ElevenLabs premium: $0.07/min
- **Telephony:**
  - Via Retell (Twilio integration): $0.01/min
  - Bring your own: $0.00
  - Phone numbers: $2.00/month
- **Knowledge Base:** First 10 free, $8/month each additional, $0.005/min when accessed
- **Branded Caller ID:** $0.10/min add-on
- **Enterprise:** $0.05+/min base (for $3K+/month spend)
- **Estimated all-in cost: $0.13-0.31/min**
- $10 free credits to start

| Plan | Price | Details |
|------|-------|---------|
| Pay-as-you-go | $0.07+/min | 20 free concurrent calls, $10 credits |
| Enterprise | $0.05+/min base | $3K+/month, custom support, higher concurrency |

**Phone Calling Support:**
- Built-in Twilio/Telnyx telephony
- Inbound and outbound PSTN
- Bring your own telephony supported
- Phone number provisioning included

**WebRTC Support:**
- Web-based calling via embeddable widget
- SDK for web and mobile

**Ease of Integration:**
- Visual flow builder (drag-and-drop)
- REST API and SDKs
- Pre-built CRM integrations (HubSpot, Salesforce, etc.)
- Go live in minutes for simple use cases
- Good documentation

**Features:**
- Low latency (sub-second)
- Simulation testing
- Analytics dashboard
- Function calling
- Unlimited concurrent calls
- Knowledge base / RAG support
- Call transcription included
- Answering machine detection

**Limitations:**
- Costs can escalate quickly with premium voices/LLMs
- Less control over individual components
- Vendor lock-in risk
- Advanced features may require Enterprise plan

---

### 3. Vapi AI

**What it is:** A developer-centric voice AI platform that acts as an orchestration layer connecting STT, LLM, TTS, and telephony components into working call flows.

**How it works:** API-first platform where you configure agents programmatically. Vapi manages call state, streaming, and orchestration. You bring your own AI services or use their defaults.

**Pricing:**
- **Vapi hosting fee:** $0.05/min (base platform charge)
- **Transcription (STT):** ~$0.01/min (Deepgram)
- **LLM processing:** ~$0.02-0.20/min (depends on model)
- **Voice generation (TTS):** ~$0.04/min (ElevenLabs/PlayHT)
- **Telephony:** ~$0.01/min
- **Estimated all-in cost: $0.13-0.31+/min**

| Plan | Price | Included Minutes |
|------|-------|-----------------|
| Ad-Hoc (PAYG) | $0.05/min + add-ons | None (pure usage) |
| Startup | Monthly fee | 3,000 min |
| Agency | $400/month | 3,000 min |
| Enterprise | Custom | 7,500 min |

**Additional costs that add up:**
- 10 concurrent SIP lines included, additional lines $10/line/month
- Call recording: 7-day storage included, unlimited storage $200/month
- HIPAA compliance: $1,000/month
- Slack support: $2,000/month

**Phone Calling Support:**
- SIP trunking support
- Twilio/Vonage integration
- Inbound and outbound PSTN
- Vapi-managed telephony available

**WebRTC Support:**
- Web, iOS, Android SDKs
- Daily WebRTC integration

**Ease of Integration:**
- API-first, developer-focused
- CLI tools available
- Flow Studio (visual builder)
- Requires technical setup
- Setup time: 1-4 weeks for production

**Features:**
- Sub-500ms latency
- Function calling
- Squads (multi-agent handoff within a call)
- Knowledge base / RAG support
- Custom vocabulary
- Programmable workflows

**Limitations:**
- Complex, layered pricing is hard to predict
- Each component billed separately by different providers
- Requires developer resources
- Support costs extra ($2K/month for Slack)
- HIPAA compliance costs $1K/month extra

---

### 4. Bland AI

**What it is:** A developer-focused voice AI infrastructure platform with APIs for building custom phone agents. Emphasizes hyper-realism and high-volume calling.

**How it works:** Provides a bundled platform with proprietary TTS, speech recognition, LLM orchestration, and telephony. You configure agents via API with custom prompts and tool integrations.

**Pricing:**
- **Per-minute rate:** $0.09/min (includes STT, TTS, telephony, basic analytics)
- **SMS:** $0.02/message
- **Estimated all-in cost: $0.09-0.15/min** (some advanced features add cost)

| Plan | Monthly Fee | Daily Cap | Concurrency | Voice Clones |
|------|-------------|-----------|-------------|--------------|
| Start (Free) | $0 | 100 calls | 10 | 1 |
| Build | $299/month | 2,000 calls | 50 | 5 |
| Scale | $499/month | 5,000 calls | 100 | 15 |
| Enterprise | Custom | Unlimited | Unlimited | Unlimited |

**Phone Calling Support:**
- Built-in telephony (inbound and outbound PSTN)
- Twilio integration
- Up to 20,000 calls/hour at enterprise scale
- Dedicated phone numbers available

**WebRTC Support:**
- Limited -- primarily phone-focused
- No native browser calling widget

**Ease of Integration:**
- API-driven
- Simpler than Vapi (more bundled)
- Requires developer skills
- Custom voice cloning available

**Features:**
- Average response latency: ~800ms
- 20+ languages supported
- SOC Type II, GDPR, HIPAA compliant
- Custom prompts and sample dialogues
- Webhooks and API integrations
- SMS sending mid-call

**Limitations:**
- Phone-only (no web/browser calling)
- Daily call caps on non-enterprise plans
- Less flexibility in component choice (proprietary stack)
- Voice quality sometimes inconsistent per reviews
- Limited analytics compared to Retell

---

### 5. LiveKit

**What it is:** An open-source real-time communication platform with a dedicated Agents framework for building voice, video, and multimodal AI agents. Built on WebRTC.

**How it works:** LiveKit provides the real-time transport infrastructure (WebRTC rooms). The Agents framework lets you build AI agents in Python or Node.js that join rooms as participants. Telephony is handled via SIP trunking into LiveKit rooms.

**Pricing (LiveKit Cloud):**

| Component | Cost |
|-----------|------|
| Agent session | $0.01/min |
| Telephony (PSTN via SIP) | $0.01/min |
| STT (Deepgram Nova-3) | ~$0.005/min |
| LLM (GPT-4o-mini) | ~$0.006/min |
| TTS (Cartesia Sonic) | ~$0.01/min |
| WebRTC connection | Included |

**Estimated all-in cost: $0.04-0.08/min**

| Plan | Monthly Fee | Included Agent Minutes | Concurrency |
|------|-------------|----------------------|-------------|
| Build (Free) | $0 | 1,000 min | 5 |
| Ship | $50/month | 5,000 min | 20 |
| Scale | $500/month | 50,000 min | Up to 600 |
| Enterprise | Custom | Custom | Custom |

**Phone Calling Support:**
- SIP trunking (Twilio, Telnyx, etc.)
- Inbound and outbound PSTN calls
- DTMF support
- SIP REFER (call transfers)
- Phone calls bridged into LiveKit rooms as SIP participants
- No significant agent code changes needed for telephony

**WebRTC Support:**
- Best-in-class WebRTC (core competency)
- Browser, iOS, Android, Flutter SDKs
- Video + audio support
- LiveKit Meet (open-source video app)

**Ease of Integration:**
- Python and Node.js SDKs
- Well-documented
- Growing community (9.5K+ GitHub stars for agents repo)
- More setup required than Retell, but less than raw Pipecat
- Inference credits for AI models included in plans

**Features:**
- Ultra-low latency WebRTC transport
- Noise cancellation (Krisp-based, with telephony mode)
- Multi-lingual turn detection
- Function calling / tool use
- Agent observability and metrics
- Multi-modal (voice + video)
- Supports both pipeline (STT+LLM+TTS) and realtime models (OpenAI Realtime)
- Open-source agents framework

**Limitations:**
- Requires development effort (not no-code)
- No visual flow builder
- Telephony requires SIP trunk setup
- Self-hosting LiveKit Server is complex (Cloud recommended)
- Newer platform, smaller ecosystem than some competitors

---

### 6. OpenAI Realtime API

**What it is:** OpenAI's native API for building low-latency, multimodal voice experiences. It provides a unified speech-to-speech pipeline where the model handles STT, reasoning, and TTS in one pass.

**How it works:** Instead of the traditional STT -> LLM -> TTS pipeline, the Realtime API processes audio end-to-end. Supports WebRTC (browser), WebSocket (server), and SIP connections. Requires a separate transport/telephony layer.

**Pricing (token-based):**

| Model | Audio Input | Cached Audio Input | Audio Output |
|-------|-------------|-------------------|--------------|
| gpt-realtime | $32.00/1M tokens | $0.40/1M tokens | $64.00/1M tokens |
| gpt-realtime-mini | $10.00/1M tokens | $0.30/1M tokens | $20.00/1M tokens |

**Approximate per-minute costs:**
- gpt-realtime: ~$0.06/min input + ~$0.24/min output = **~$0.30/min**
- gpt-realtime-mini: ~$0.02/min input + ~$0.08/min output = **~$0.10/min**

**Note:** These costs are ONLY for the AI model. You still need telephony ($0.01-0.014/min) and transport infrastructure.

**Phone Calling Support:**
- Not built-in -- requires external telephony (Twilio, LiveKit SIP, etc.)
- Can connect via SIP through LiveKit or similar
- WebRTC for browser-based calls

**WebRTC Support:**
- Native WebRTC support for browser connections
- Direct browser-to-API audio streaming

**Ease of Integration:**
- Well-documented API
- Requires building your own transport layer
- Best used through a framework like Pipecat or LiveKit Agents
- No dashboard or visual builder

**Features:**
- True speech-to-speech (lowest possible latency)
- Sub-second response times
- Built-in interruption handling
- Session memory (conversation history maintained)
- Function calling / tool use
- Multi-modal (text + audio)

**Limitations:**
- Expensive at scale (especially gpt-realtime full model)
- Token-based pricing is unpredictable
- No telephony -- must build or buy separately
- Vendor lock-in to OpenAI
- No built-in call management, analytics, or recording
- Cannot choose separate STT/TTS providers

---

### 7. Air AI

**What it is:** A conversational voice AI platform that automates long phone calls (10-40 minutes) using generative AI. Focused on sales and customer service automation.

**How it works:** SaaS platform with pre-configured phone agents. Less developer-focused, more "configure and deploy" approach. Handles multi-turn dialogue, CRM integration, and campaign management.

**Pricing:**
- **Per-minute rate:** ~$0.11/min
- **Custom/enterprise pricing** -- often requires contacting sales
- **Estimated all-in cost: $0.11-0.15/min**
- Higher upfront costs reported in some reviews

**Phone Calling Support:**
- Built-in PSTN (inbound and outbound)
- Pre-configured phone agents
- Campaign management for outbound

**WebRTC Support:**
- Not a primary focus
- Phone-first platform

**Ease of Integration:**
- Low-code / no-code setup
- CRM integrations available
- Less customizable than developer platforms

**Features:**
- Long-form conversation handling (10-40 min calls)
- Human-like voice quality
- Multi-turn dialogue management
- CRM integration

**Limitations:**
- Regulatory/legal issues reported (class action lawsuits mentioned in reviews)
- Latency concerns in some reviews
- No live chat support (ticketing system only)
- Less transparent pricing
- Limited customization compared to developer platforms
- Risky bet for production in 2026 given legal concerns

---

### 8. Vocode

**What it is:** An open-source library for building voice-based LLM applications. Provides abstractions for phone calls, Zoom meetings, and personal assistants.

**How it works:** Modular Python library with easy abstractions for conversation flow. Also offers a hosted service with managed telephony. Can deploy to phone calls via Twilio or other providers.

**Pricing:**

| Plan | Monthly Price | Features |
|------|--------------|----------|
| Free | $0 | Basic call functions, open-source API |
| Developer | $25/month | Priority support, enhanced API, external TTS/STT |
| Enterprise | Custom | Full API, advanced analytics, multilingual, custom SLAs |
| Phone Numbers | $3/month each | Dedicated phone numbers |

**Phone Calling Support:**
- Twilio integration (hosted service)
- Bring your own telephony (Enterprise)
- Inbound and outbound calls

**WebRTC Support:**
- Limited compared to LiveKit/Pipecat
- Primarily phone and WebSocket focused

**Ease of Integration:**
- Python library with good abstractions
- Simpler than Pipecat for basic use cases
- Less active development than Pipecat/LiveKit in 2025-2026
- Smaller community

**Features:**
- Phone calls, Zoom meetings support
- Warm transfer (beta)
- IVR navigation (beta)
- HIPAA compliance (beta)
- Multilingual (beta)
- Actions and webhooks

**Limitations:**
- Many features still in beta
- Smaller community than Pipecat or LiveKit
- Less active maintenance/updates
- Limited telephony provider support vs Pipecat
- Not recommended for new production deployments when Pipecat/LiveKit exist

---

## Pricing Comparison Table

### Advertised vs True All-In Cost Per Minute

| Provider | Type | Advertised Rate | True All-In Cost/Min | 10K Min/Month Cost | Notes |
|----------|------|----------------|---------------------|-------------------|-------|
| **Pipecat + LiveKit** | Open-source + Cloud | $0.00 (framework) | **$0.04-0.08** | **$400-800** | Cheapest option, most control |
| **Pipecat Cloud** | Managed OSS | $0.01/min (hosting) | **$0.05-0.10** | **$500-1,000** | Good balance of control + convenience |
| **LiveKit Cloud** | Platform | $0.01/min (session) | **$0.04-0.08** | **$400-800** | Excellent WebRTC, good telephony |
| **Retell AI** | Managed | $0.07/min | **$0.13-0.31** | **$1,300-3,100** | Easy setup, higher cost |
| **Bland AI** | Managed | $0.09/min | **$0.09-0.15** | **$900-1,500** | Bundled pricing, phone-only |
| **Vapi AI** | Platform | $0.05/min | **$0.13-0.31** | **$1,300-3,100** | Complex layered pricing |
| **Air AI** | SaaS | ~$0.11/min | **$0.11-0.15** | **$1,100-1,500** | Legal concerns, less transparent |
| **Vocode** | Open-source + Hosted | $0/free or $25/mo | **$0.04-0.10** | **$400-1,000** | Less maintained |
| **OpenAI Realtime** | API only | Token-based | **$0.10-0.30** | **$1,000-3,000** | Model cost only, no telephony |
| **OpenAI Realtime Mini** | API only | Token-based | **$0.04-0.10** | **$400-1,000** | Model cost only, no telephony |

### Monthly Cost Projections for Agent Matcha

Assuming **5,000 minutes/month** (roughly 330 calls at ~15 min each):

| Stack | Monthly Cost | Annual Cost |
|-------|-------------|-------------|
| Pipecat/LiveKit + Deepgram + GPT-4o-mini + Cartesia | **$250-450** | **$3,000-5,400** |
| Pipecat/LiveKit + Deepgram + Claude Haiku + Cartesia | **$275-500** | **$3,300-6,000** |
| Retell AI (mid-tier config) | **$750-1,200** | **$9,000-14,400** |
| Vapi AI (mid-tier config) | **$750-1,200** | **$9,000-14,400** |
| Bland AI | **$450-750** | **$5,400-9,000** |

---

## Build vs Buy Analysis

### Option A: Build with Open-Source Stack (Pipecat + LiveKit)

**Upfront Cost:** $5K-15K in developer time (1-3 weeks for experienced dev)

**Pros:**
- Lowest per-minute cost ($0.04-0.08/min)
- Full control over every component
- No vendor lock-in
- Can swap any component (STT, LLM, TTS) independently
- Can optimize each piece for cost/quality
- Self-host for even lower costs at scale

**Cons:**
- Requires Python development skills
- Infrastructure management (unless using Pipecat Cloud/LiveKit Cloud)
- No visual flow builder
- Must build analytics/dashboards yourself
- Longer time to production (weeks, not days)

**Best for:** Teams with engineering resources who want cost control at scale.

### Option B: Buy Managed Platform (Retell AI)

**Upfront Cost:** Near zero (self-serve)

**Pros:**
- Live in minutes, not weeks
- Visual flow builder
- Built-in analytics and testing
- Pre-built CRM integrations
- Managed infrastructure
- Enterprise support available

**Cons:**
- 2-4x more expensive per minute ($0.13-0.31/min)
- Less control over components
- Vendor lock-in
- Customization limited to platform capabilities
- Costs escalate with premium features

**Best for:** Non-technical teams or those needing fast time-to-market.

### Option C: Hybrid (LiveKit Cloud + Custom Agent Code)

**Upfront Cost:** $3K-8K in developer time

**Pros:**
- Cloud infrastructure managed for you
- Open-source agent code you own
- Good balance of control and convenience
- Competitive pricing ($0.04-0.08/min)
- Strong telephony support via SIP
- Inference credits bundled

**Cons:**
- Still requires development
- Newer platform (less battle-tested than Retell)
- No visual builder

**Best for:** Agent Matcha. See recommendation below.

---

## Cost Optimization Strategies

### STT (Speech-to-Text) Options

| Provider | Cost/Min | Streaming | Quality | Best For |
|----------|----------|-----------|---------|----------|
| **Deepgram Nova-3** | $0.0043-0.0077 | Yes, <300ms | Excellent (5.26% WER) | **Best value for voice agents** |
| OpenAI Whisper API | $0.006 | No (batch only) | Excellent | Batch transcription |
| AssemblyAI | $0.006-0.015 | Yes, 300ms | Good (10.7% WER) | Good alternative |
| Google Cloud STT | $0.006-0.016 | Yes | Moderate | Google ecosystem |
| Azure Speech | $0.024 | Yes | Good | Microsoft ecosystem |

**Recommendation:** Deepgram Nova-3 at $0.0043-0.0077/min. Best accuracy, lowest latency, cheapest streaming option. Bills by the second (not 15-second increments), saving 30-40% on short utterances.

### TTS (Text-to-Speech) Options

| Provider | Cost | Latency | Quality | Best For |
|----------|------|---------|---------|----------|
| **Cartesia Sonic** | ~$0.05/1K chars | 95ms | Very good (conversational) | **Best for voice agents** |
| Deepgram Aura-2 | ~$0.015/1K chars | Low | Good | Budget option |
| ElevenLabs | ~$0.30/1K chars | 75ms | Excellent (most realistic) | Premium quality |
| OpenAI TTS | ~$0.015-0.030/1K chars | Moderate | Good | OpenAI ecosystem |
| Speechmatics | ~$0.011/1K chars | <200ms | Good | Budget + quality |
| Smallest.ai | $0.02/min | Low | Good | Ultra-budget |
| PlayHT | ~$0.05/1K chars | Moderate | Good | Voice cloning |
| Rime | Competitive | Low | Good | Low-latency focus |

**Recommendation:** Cartesia Sonic for the best balance of quality, latency, and price for real-time voice agents. If budget is paramount, Deepgram Aura-2 or Speechmatics. If voice quality is paramount (e.g., for a premium matchmaking brand), consider ElevenLabs but expect 6-10x higher TTS costs.

### LLM Options

| Model | Cost/Min (approx) | Quality | Latency | Best For |
|-------|-------------------|---------|---------|----------|
| **GPT-4o-mini** | ~$0.006 | Good | Fast | **Best value** |
| **GPT-4.1-mini** | ~$0.003-0.005 | Good | Fast | Newest budget option |
| Claude 3.5 Haiku | ~$0.01 | Good | Fast | Anthropic ecosystem |
| Gemini 2.0 Flash | ~$0.006 | Good | Fast | Google ecosystem |
| GPT-4o | ~$0.05 | Excellent | Moderate | Complex reasoning |
| Groq (Llama 3) | ~$0.003-0.01 | Good | Ultra-fast | Lowest latency |
| Claude 3.7 Sonnet | ~$0.06 | Excellent | Moderate | Complex reasoning |

**Recommendation:** GPT-4.1-mini or GPT-4o-mini for the intake agent. Good enough for conversational intake, very cheap, fast response times. For complex upsell conversations or nuanced matchmaking intake, consider GPT-4o or Claude 3.7 Sonnet at 5-10x the cost.

### Telephony Cost

| Provider | Inbound | Outbound | SIP Trunking | Phone Number |
|----------|---------|----------|--------------|-------------|
| **Twilio** | $0.0085/min | $0.014/min | $0.004/min | $1.00/month |
| Telnyx | ~$0.007/min | ~$0.012/min | Competitive | $1.00/month |
| Plivo | ~$0.009/min | ~$0.012/min | Competitive | $0.80/month |
| LiveKit Telephony | $0.01/min | $0.01/min | Included | 1 free number |

**Recommendation:** For Agent Matcha (inbound calls to a dedicated number), Twilio SIP trunking at $0.004/min is the cheapest for high-volume. LiveKit's bundled telephony at $0.01/min is simpler to set up. At our projected volume (~5K min/month), the difference is $20-50/month, so simplicity wins -- use LiveKit's built-in telephony.

---

## WebRTC vs SIP

### For Agent Matcha's Use Case

| Factor | WebRTC | SIP |
|--------|--------|-----|
| **Use case** | Browser/mobile app calls | Phone (PSTN) calls |
| **Encryption** | Built-in (SRTP, DTLS) | Requires configuration |
| **NAT traversal** | Built-in (ICE/STUN/TURN) | Problematic |
| **Latency** | Lower (optimized media) | Higher (more hops) |
| **Setup complexity** | Easier for web | Easier for phone systems |
| **Phone network access** | Requires SIP gateway | Native |
| **Browser support** | Native | Requires gateway |
| **Mobile support** | Excellent | Poor (battery, background) |

### Recommendation for Agent Matcha

**Use BOTH:**
- **SIP** for PSTN phone calls (inbound to your Twilio number) -- this is your primary use case
- **WebRTC** for a future web-based calling widget on Club Allenby's website

LiveKit natively supports both. Phone calls come in via SIP and are bridged into LiveKit rooms. Web calls connect directly via WebRTC. The same agent code handles both -- no changes needed.

---

## Recommended Stack for Agent Matcha

### Primary Recommendation: LiveKit Cloud + Pipecat-style Pipeline

| Component | Choice | Cost/Min | Rationale |
|-----------|--------|----------|-----------|
| **Framework** | LiveKit Agents (Python) | -- | Open-source, excellent telephony, great docs |
| **Hosting** | LiveKit Cloud (Scale plan) | $0.01 | Managed infrastructure, 50K min included |
| **STT** | Deepgram Nova-3 | $0.005 | Best accuracy + speed, cheapest streaming |
| **LLM** | GPT-4.1-mini | $0.005 | Best cost/quality ratio for conversational AI |
| **TTS** | Cartesia Sonic | $0.01-0.02 | Fast, natural, good for conversation |
| **Telephony** | LiveKit SIP (Twilio trunk) | $0.01 | Simple setup, inbound + outbound |
| **Noise Cancel** | Krisp (built into LiveKit) | $0.00 | Included, with telephony-optimized mode |
| **VAD** | Silero VAD | $0.00 | Open-source, built into framework |
| **TOTAL** | | **$0.04-0.06/min** | |

### Monthly Cost Estimate (5,000 minutes)

| Item | Monthly Cost |
|------|-------------|
| LiveKit Cloud (Scale) | $500 (includes 50K min) |
| Deepgram Nova-3 STT | ~$25-38 |
| GPT-4.1-mini LLM | ~$25-30 |
| Cartesia Sonic TTS | ~$50-100 |
| Twilio SIP trunk | ~$20-30 |
| Phone number | ~$1 |
| **TOTAL** | **~$620-700/month** |

Compared to Retell AI at the same volume: **~$1,300-2,000/month** (saving 50-65%).

### Why This Stack

1. **Cost:** At $0.04-0.06/min all-in, this is 2-5x cheaper than managed platforms
2. **Control:** Swap any component without changing the rest
3. **Quality:** Deepgram + Cartesia + GPT-4.1-mini is the recommended stack by Daily.co (Pipecat creators) for production voice agents in 2026
4. **Telephony:** LiveKit has first-class SIP support -- phone calls are bridged into rooms with no agent code changes
5. **WebRTC:** When you want to add web/app calling later, it's built-in
6. **Scalability:** LiveKit Cloud scales to hundreds of concurrent calls
7. **Open Source:** No vendor lock-in on the framework layer
8. **Noise Cancellation:** Krisp telephony-optimized model included free

### Alternative Recommendation: If You Want Faster Time-to-Market

Use **Retell AI** for MVP, then migrate to LiveKit when volume justifies it:

| Phase | Stack | Cost/Min | Timeline |
|-------|-------|----------|----------|
| MVP (Month 1-3) | Retell AI | $0.13-0.20 | Days to launch |
| Scale (Month 4+) | LiveKit Cloud | $0.04-0.06 | 2-3 weeks migration |

---

## Architecture Diagram

### Production Architecture: LiveKit Cloud + SIP

```
                    PSTN Phone Network
                          |
                    [Twilio SIP Trunk]
                          |
                    [LiveKit Cloud]
                     /     |      \
                    /      |       \
          [SIP Bridge]  [WebRTC]  [Agent Runtime]
               |           |           |
        Phone Caller   Web Caller   AI Agent
                                       |
                          +------------+------------+
                          |            |            |
                    [Deepgram]    [GPT-4.1]    [Cartesia]
                      (STT)       (LLM)        (TTS)
                          |            |            |
                          +-----+------+------+-----+
                                |             |
                          [Function Calls]  [Webhooks]
                                |             |
                          +-----+------+------+-----+
                          |            |            |
                     [CRM/DB]    [Calendar]   [Stripe]
                   (SmartMatch)  (Booking)   (Payments)
```

### Call Flow

```
1. Caller dials Club Allenby's Twilio number
2. Twilio forwards via SIP to LiveKit Cloud
3. LiveKit creates a room, bridges the SIP call in
4. AI Agent joins the room as a participant
5. Audio flows: Caller -> LiveKit -> Agent
6. Agent pipeline:
   a. Deepgram transcribes caller speech (STT)
   b. GPT-4.1-mini generates response (LLM)
   c. Cartesia synthesizes speech (TTS)
   d. Audio streams back to caller
7. During conversation, agent can:
   - Call functions (check CRM, book appointment, process payment)
   - Transfer to live agent (SIP REFER)
   - Send SMS follow-up via Twilio
8. After call:
   - Transcript saved to database
   - AI summary generated
   - CRM updated with call notes
```

### Web Calling Extension (Future)

```
Club Allenby Website
        |
  [JavaScript SDK]
        |
  [WebRTC Connection]
        |
  [LiveKit Cloud]
        |
  [Same AI Agent]  <-- No code changes needed
```

---

## Key Takeaways

1. **Build, don't buy** -- For a 10-15 minute intake call at scale, the per-minute cost difference between open-source ($0.04-0.06) and managed ($0.13-0.31) adds up to thousands per month.

2. **LiveKit Cloud is the sweet spot** -- Open-source framework with managed infrastructure. Better telephony support than Pipecat Cloud, competitive pricing, and a strong trajectory.

3. **Deepgram + GPT-4.1-mini + Cartesia** is the consensus "best stack" for production voice agents in 2026 -- fastest, cheapest, good quality.

4. **Avoid OpenAI Realtime API as primary** -- Too expensive ($0.10-0.30/min) and locks you into OpenAI for everything. Use the traditional STT+LLM+TTS pipeline for cost control.

5. **Start with LiveKit Cloud, optimize later** -- If costs need to drop further at massive scale, you can self-host LiveKit Server and use Twilio SIP trunking directly ($0.004/min).

6. **Plan for both phone and web** -- LiveKit handles both with the same agent code, future-proofing the Club Allenby calling experience.
