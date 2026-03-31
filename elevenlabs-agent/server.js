/**
 * Twilio ↔ ElevenLabs WebSocket Bridge Server
 *
 * Handles inbound and outbound phone calls by bridging Twilio Media Streams
 * with ElevenLabs Conversational AI WebSocket.
 *
 * Run: node server.js
 * Requires: ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, TWILIO_*, CONVEX_URL
 */

import Fastify from "fastify";
import fastifyWs from "@fastify/websocket";
import { WebSocket } from "ws";
import Twilio from "twilio";

const PORT = process.env.BRIDGE_PORT || 8081;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID || process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID;
const CONVEX_URL = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || "+17869986661";

const fastify = Fastify({ logger: true });
fastify.register(fastifyWs);

// ── Helpers ─────────────────────────────────────────────────────────

async function convexPost(path, data) {
  if (!CONVEX_URL) return {};
  const res = await fetch(`${CONVEX_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.ok ? res.json() : {};
}

async function getSignedUrl() {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${ELEVENLABS_AGENT_ID}`,
    { headers: { "xi-api-key": ELEVENLABS_API_KEY } },
  );
  const { signed_url } = await res.json();
  return signed_url;
}

// ── Inbound call TwiML ─────────────────────────────────────────────

fastify.all("/inbound", async (request, reply) => {
  const phone = request.body?.From || request.query?.From || "";
  fastify.log.info(`Inbound call from: ${phone}`);

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${request.headers.host}/media-stream">
      <Parameter name="phone" value="${phone}" />
      <Parameter name="direction" value="inbound" />
    </Stream>
  </Connect>
</Response>`;

  reply.type("text/xml").send(twiml);
});

// ── Outbound call trigger ──────────────────────────────────────────

fastify.post("/outbound-call", async (request, reply) => {
  const { phone, context, notes, memberId } = request.body;

  if (!phone) {
    return reply.status(400).send({ error: "phone is required" });
  }

  // Clean phone to E.164
  let cleanPhone = phone.replace(/[^\d+]/g, "");
  const digits = cleanPhone.replace(/\D/g, "");
  if (digits.length === 10) cleanPhone = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) cleanPhone = `+${digits}`;
  else if (!cleanPhone.startsWith("+")) cleanPhone = `+${digits}`;

  if (!/^\+\d{10,15}$/.test(cleanPhone)) {
    return reply.status(400).send({ error: "Invalid phone number format", code: "INVALID_NUMBER" });
  }

  try {
    const twilioClient = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const bridgeHost = request.headers.host;

    const call = await twilioClient.calls.create({
      from: TWILIO_PHONE_NUMBER,
      to: cleanPhone,
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${bridgeHost}/media-stream">
      <Parameter name="phone" value="${cleanPhone}" />
      <Parameter name="direction" value="outbound" />
      <Parameter name="context" value="${context || "full_intake"}" />
      <Parameter name="notes" value="${notes || ""}" />
      <Parameter name="memberId" value="${memberId || ""}" />
    </Stream>
  </Connect>
</Response>`,
      machineDetection: "Enable",
      timeout: 30,
    });

    fastify.log.info(`Outbound call placed: SID=${call.sid} to=${cleanPhone}`);
    return { success: true, callSid: call.sid, phone: cleanPhone };
  } catch (err) {
    fastify.log.error(`Outbound call failed: ${err.message}`);
    const errLower = (err.message || "").toLowerCase();

    if (errLower.includes("busy")) {
      return reply.status(409).send({ error: "The line is busy.", code: "BUSY" });
    }
    if (errLower.includes("no answer") || errLower.includes("timeout")) {
      return reply.status(408).send({ error: "No answer.", code: "NO_ANSWER" });
    }
    return reply.status(502).send({ error: `Failed to connect: ${err.message}`, code: "SIP_ERROR" });
  }
});

// ── WebSocket bridge: Twilio Media Stream ↔ ElevenLabs ─────────────

fastify.register(async function (app) {
  app.get("/media-stream", { websocket: true }, (socket, req) => {
    fastify.log.info("Twilio Media Stream connected");

    let elWs = null;
    let streamSid = null;
    let callId = null;
    let phone = "";
    let direction = "inbound";
    let context = "full_intake";
    let notes = "";
    let memberId = "";
    const transcript = [];
    const callStartTime = Date.now();

    // ── Handle Twilio messages ──────────────────────────────────────

    socket.on("message", async (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      switch (msg.event) {
        case "start": {
          streamSid = msg.start.streamSid;
          const params = msg.start.customParameters || {};
          phone = params.phone || "";
          direction = params.direction || "inbound";
          context = params.context || "full_intake";
          notes = params.notes || "";
          memberId = params.memberId || "";

          fastify.log.info(`Stream started: SID=${streamSid} phone=${phone} direction=${direction}`);

          // Register call in Convex
          try {
            const result = await convexPost("/voice/call-started", {
              livekitRoomId: `elevenlabs-phone-${streamSid}`,
              phone,
              direction,
            });
            callId = result.callId;
            fastify.log.info(`Call registered: callId=${callId}`);
          } catch (e) {
            fastify.log.warn(`Failed to register call: ${e.message}`);
          }

          // Connect to ElevenLabs
          try {
            const signedUrl = await getSignedUrl();
            elWs = new WebSocket(signedUrl);

            elWs.on("open", () => {
              fastify.log.info("ElevenLabs WebSocket connected");

              // Send initialization with overrides
              elWs.send(JSON.stringify({
                type: "conversation_initiation_client_data",
                conversation_config_override: {
                  agent: {
                    prompt: {
                      prompt: "", // Use default agent prompt; override via dashboard settings
                    },
                  },
                },
                dynamic_variables: {
                  phone_number: phone,
                  direction,
                  context,
                  agent_notes: notes,
                  member_id: memberId,
                },
              }));
            });

            elWs.on("message", (data) => {
              handleElevenLabsMessage(JSON.parse(data.toString()));
            });

            elWs.on("close", () => {
              fastify.log.info("ElevenLabs WebSocket closed");
              endCall("completed");
            });

            elWs.on("error", (err) => {
              fastify.log.error(`ElevenLabs WS error: ${err.message}`);
            });
          } catch (e) {
            fastify.log.error(`Failed to connect to ElevenLabs: ${e.message}`);
          }
          break;
        }

        case "media": {
          // Forward Twilio audio to ElevenLabs
          if (elWs?.readyState === WebSocket.OPEN) {
            // Twilio sends mulaw 8kHz, ElevenLabs expects PCM 16kHz
            // The audio format is handled by the base64 payload
            elWs.send(JSON.stringify({
              user_audio_chunk: msg.media.payload,
            }));
          }
          break;
        }

        case "stop": {
          fastify.log.info("Twilio stream stopped");
          endCall("completed");
          break;
        }
      }
    });

    // ── Handle ElevenLabs messages ──────────────────────────────────

    function handleElevenLabsMessage(msg) {
      switch (msg.type) {
        case "audio": {
          // Forward ElevenLabs audio to Twilio
          if (socket.readyState === WebSocket.OPEN && streamSid) {
            socket.send(JSON.stringify({
              event: "media",
              streamSid,
              media: {
                payload: msg.audio?.chunk || msg.audio_event?.audio_base_64 || "",
              },
            }));
          }
          break;
        }

        case "user_transcript": {
          const text = msg.user_transcription_event?.user_transcript || msg.user_transcript || "";
          if (text && callId) {
            transcript.push({ speaker: "caller", text, timestamp: Date.now() / 1000 });
            convexPost("/voice/transcript-segment", {
              callId,
              speaker: "caller",
              text,
              timestamp: Date.now() / 1000,
            }).catch(() => {});
          }
          break;
        }

        case "agent_response": {
          const text = msg.agent_response_event?.agent_response || msg.agent_response || "";
          if (text && callId) {
            transcript.push({ speaker: "agent", text, timestamp: Date.now() / 1000 });
            convexPost("/voice/transcript-segment", {
              callId,
              speaker: "agent",
              text,
              timestamp: Date.now() / 1000,
            }).catch(() => {});
          }
          break;
        }

        case "client_tool_call": {
          handleToolCall(msg).catch((e) => {
            fastify.log.error(`Tool call failed: ${e.message}`);
          });
          break;
        }

        case "ping": {
          if (elWs?.readyState === WebSocket.OPEN) {
            elWs.send(JSON.stringify({
              type: "pong",
              event_id: msg.ping_event?.event_id || msg.event_id,
            }));
          }
          break;
        }
      }
    }

    // ── Tool call handler ──────────────────────────────────────────

    async function handleToolCall(msg) {
      const toolName = msg.client_tool_call?.tool_name || msg.tool_name;
      const toolCallId = msg.client_tool_call?.tool_call_id || msg.tool_call_id;
      const params = msg.client_tool_call?.parameters || msg.parameters || {};

      fastify.log.info(`Tool call: ${toolName} (${toolCallId})`);

      let result = "";

      switch (toolName) {
        case "save_intake_data": {
          if (callId) {
            const data = {};
            for (const [key, val] of Object.entries(params)) {
              if (val === null || val === undefined) continue;
              const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
              data[camelKey] = val;
            }
            await convexPost("/voice/save-intake-data", { callId, data });
            result = "Data saved successfully.";
          } else {
            result = "No active call.";
          }
          break;
        }

        case "save_deep_dive_data": {
          if (callId) {
            const tags = {};
            for (const k of ["attachment_style", "communication_style", "energy_level",
              "life_stage", "emotional_maturity", "social_style", "love_language", "conflict_style"]) {
              if (params[k]) tags[k] = String(params[k]);
            }
            await convexPost("/voice/save-deep-dive", {
              callId,
              data: {
                matchmakerNote: params.matchmaker_note || "",
                tags,
                conversationSummary: params.conversation_summary || "",
              },
            });
            result = "Deep dive data saved.";
          } else {
            result = "No active call.";
          }
          break;
        }

        case "send_data_request_link": {
          if (memberId) {
            await convexPost("/voice/send-data-request", { memberId });
            result = "Form link sent via WhatsApp.";
          } else {
            result = "No member found.";
          }
          break;
        }

        case "start_deep_dive": {
          if (callId) {
            await convexPost("/voice/save-intake-data", {
              callId,
              data: { phase2Started: true },
            });
          }
          result = "Phase 2 activated. Transition naturally into the deeper conversation.";
          break;
        }

        case "start_membership_pitch": {
          result = "Phase 3 activated. Transition naturally into the membership overview.";
          break;
        }

        case "end_call": {
          result = "Call ended.";
          // End the call after a brief delay for the goodbye to play
          setTimeout(() => endCall("completed"), 3000);
          break;
        }

        default:
          result = `Unknown tool: ${toolName}`;
      }

      // Send tool result back to ElevenLabs
      if (elWs?.readyState === WebSocket.OPEN) {
        elWs.send(JSON.stringify({
          type: "client_tool_result",
          tool_call_id: toolCallId,
          result,
        }));
      }
    }

    // ── End call cleanup ──────────────────────────────────────────

    let ended = false;
    function endCall(status) {
      if (ended) return;
      ended = true;

      const duration = Math.round((Date.now() - callStartTime) / 1000);
      fastify.log.info(`Call ending: callId=${callId} duration=${duration}s status=${status}`);

      if (callId) {
        convexPost("/voice/call-ended", {
          callId,
          duration,
          transcript,
          status,
        }).catch(() => {});
      }

      if (elWs?.readyState === WebSocket.OPEN) {
        elWs.close();
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    }

    socket.on("close", () => {
      fastify.log.info("Twilio socket closed");
      endCall("completed");
    });

    socket.on("error", (err) => {
      fastify.log.error(`Twilio socket error: ${err.message}`);
      endCall("failed");
    });
  });
});

// ── Health check ────────────────────────────────────────────────────

fastify.get("/health", async () => ({ status: "ok", agent: ELEVENLABS_AGENT_ID }));

// ── Start ───────────────────────────────────────────────────────────

fastify.listen({ port: PORT, host: "0.0.0.0" }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Twilio ↔ ElevenLabs bridge running on port ${PORT}`);
});
