"""
HTTP client for calling Convex backend from the Python voice agent.

All Convex interaction goes through HTTP endpoints defined in convex/voice/http.ts.
"""

import os
import httpx
from typing import Any


class ConvexClient:
    """Async HTTP client for the Convex voice API endpoints."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or os.environ["CONVEX_URL"]).rstrip("/")
        self._client = httpx.AsyncClient(timeout=30.0)

    async def _post(self, path: str, data: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        resp = await self._client.post(url, json=data)
        resp.raise_for_status()
        return resp.json()

    # ── Call lifecycle ────────────────────────────────────────────────

    async def call_started(
        self,
        *,
        livekit_room_id: str,
        sip_call_id: str | None = None,
        phone: str | None = None,
        direction: str = "inbound",
        sandbox: bool = False,
    ) -> dict[str, Any]:
        """Log a new call and return member data if found."""
        payload: dict[str, Any] = {
            "livekitRoomId": livekit_room_id,
            "sipCallId": sip_call_id,
            "phone": phone,
            "direction": direction,
        }
        if sandbox:
            payload["sandbox"] = True
        return await self._post("/voice/call-started", payload)

    async def call_ended(
        self,
        *,
        call_id: str,
        duration: int,
        transcript: list[dict[str, Any]],
        status: str = "completed",
        egress_id: str | None = None,
    ) -> dict[str, Any]:
        """Save transcript and trigger AI summary generation."""
        payload: dict[str, Any] = {
            "callId": call_id,
            "duration": duration,
            "transcript": transcript,
            "status": status,
        }
        if egress_id:
            payload["egressId"] = egress_id
        return await self._post("/voice/call-ended", payload)

    async def add_transcript_segment(
        self,
        *,
        call_id: str,
        speaker: str,
        text: str,
        timestamp: float,
        confidence: float | None = None,
    ) -> dict[str, Any]:
        """Stream a transcript segment in real-time."""
        return await self._post("/voice/transcript-segment", {
            "callId": call_id,
            "speaker": speaker,
            "text": text,
            "timestamp": timestamp,
            "confidence": confidence,
        })

    # ── Phone lookup ────────────────────────────────────────────────────

    async def lookup_phone(self, phone: str) -> dict[str, Any] | None:
        """Look up a phone number in Convex DB and SMA CRM.

        Returns member data if found, or None if the phone is unknown.
        The backend first checks the local members table, then falls back
        to searching SmartMatchApp by phone number.
        """
        try:
            result = await self._post("/voice/lookup-phone", {"phone": phone})
            if result.get("found"):
                return result
            return None
        except Exception:
            return None

    # ── Member operations ─────────────────────────────────────────────

    async def fetch_sma_profile(self, member_id: str) -> dict[str, Any] | None:
        """Fetch fresh SMA profile data for a member."""
        result = await self._post("/voice/fetch-sma-profile", {"memberId": member_id})
        return result

    async def send_data_request(self, *, member_id: str) -> dict[str, Any]:
        """Create and send a profile completion form link to the member via WhatsApp."""
        return await self._post("/voice/send-data-request", {"memberId": member_id})

    async def save_intake_data(
        self,
        *,
        call_id: str,
        data: dict[str, Any],
    ) -> dict[str, Any]:
        """Save structured intake data extracted during the call."""
        return await self._post("/voice/save-intake-data", {
            "callId": call_id,
            "data": data,
        })

    # ── Token analytics ──────────────────────────────────────────────

    async def log_voice_usage(
        self,
        *,
        call_id: str,
        duration_secs: int,
        stt_model: str,
        llm_model: str,
        tts_model: str,
        user_tokens: int,
        agent_tokens: int,
        transcript_segments: int,
    ) -> dict[str, Any]:
        """Log voice call provider usage for token/cost analytics."""
        return await self._post("/voice/log-usage", {
            "callId": call_id,
            "durationSecs": duration_secs,
            "sttModel": stt_model,
            "llmModel": llm_model,
            "ttsModel": tts_model,
            "userTokens": user_tokens,
            "agentTokens": agent_tokens,
            "transcriptSegments": transcript_segments,
        })

    # ── Cleanup ───────────────────────────────────────────────────────

    async def close(self):
        await self._client.aclose()
