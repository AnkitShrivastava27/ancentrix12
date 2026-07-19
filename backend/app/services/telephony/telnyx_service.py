# """
# Telnyx Call Control API Service
# - Fresh httpx client per request (no shared async state across event loops)
# - client_state is base64-encoded on send (Telnyx requirement)
# - Path stripping on webhook base URL
# """
# import base64
# import logging
# from datetime import datetime
# from typing import Any, Dict, List, Optional

# import httpx

# logger = logging.getLogger(__name__)
# TELNYX_BASE = "https://api.telnyx.com/v2"

# VOICE_MAP = {
#     ("en-US", "female"): "Polly.Joanna",
#     ("en-US", "male"):   "Polly.Matthew",
#     ("en-IN", "female"): "Polly.Aditi",
#     ("en-IN", "male"):   "Polly.Raveena",
#     ("hi-IN", "female"): "Polly.Aditi",
#     ("hi-IN", "male"):   "Polly.Raveena",
#     ("en-GB", "female"): "Polly.Emma",
#     ("en-GB", "male"):   "Polly.Brian",
# }

# ASR_LANGUAGE_MAP = {
#     "en-US": "en-US",
#     "en-IN": "en-IN",
#     "en-GB": "en-GB",
#     "hi-IN": "hi-IN",
# }


# def _b64(s: str) -> str:
#     """Telnyx requires client_state to be base64-encoded."""
#     return base64.b64encode(s.encode()).decode()


# def get_telnyx_voice(company: Any) -> str:
#     lang   = (getattr(company, "voice_language", None) or "en-US")
#     gender = (getattr(company, "voice_gender",   None) or "female").lower()
#     return VOICE_MAP.get((lang, gender), "Polly.Joanna")


# def get_asr_language(company: Any) -> str:
#     lang = (getattr(company, "voice_language", None) or "en-US")
#     return ASR_LANGUAGE_MAP.get(lang, "en-US")


# def _get_base_url() -> str:
#     """
#     Returns clean root URL — strips any path accidentally in env var.
#     e.g. https://abc.trycloudflare.com/api/v1/telephony/webhook
#       →  https://abc.trycloudflare.com
#     """
#     from app.core.config import settings
#     base = (settings.TELNYX_WEBHOOK_BASE_URL or "http://localhost:8000").rstrip("/")
#     for suffix in ["/api/v1/telephony/webhook", "/api/v1/telephony", "/api/v1", "/api"]:
#         if base.endswith(suffix):
#             base = base[: -len(suffix)]
#             break
#     return base


# def _make_client() -> httpx.AsyncClient:
#     """Always creates a fresh client — never shared across requests or event loops."""
#     from app.core.config import settings
#     return httpx.AsyncClient(
#         base_url=TELNYX_BASE,
#         headers={
#             "Authorization": f"Bearer {settings.TELNYX_API_KEY or ''}",
#             "Content-Type":  "application/json",
#         },
#         timeout=20.0,
#     )


# class TelnyxService:

#     def _get_connection_id(self) -> str:
#         from app.core.config import settings
#         return settings.TELNYX_CONNECTION_ID or ""

#     def _get_phone_number(self) -> str:
#         from app.core.config import settings
#         return settings.TELNYX_PHONE_NUMBER or ""

#     async def make_outbound_call(
#         self,
#         to_number: str,
#         company_id: str,
#         lead_id: Optional[str] = None,
#         call_mode: str = "sales",
#         from_number: Optional[str] = None,
#         connection_id: Optional[str] = None,
#     ) -> Optional[str]:
#         resolved_connection_id = connection_id or self._get_connection_id()
#         if not resolved_connection_id:
#             logger.error(f"No connection_id for company={company_id} — set TELNYX_CONNECTION_ID")
#             return None

#         resolved_from = from_number or self._get_phone_number()
#         if not resolved_from:
#             logger.error(f"No from-number for company={company_id} — set TELNYX_PHONE_NUMBER")
#             return None

#         webhook_url = (
#             f"{_get_base_url()}/api/v1/telephony/webhook"
#             f"?company_id={company_id}&lead_id={lead_id or ''}&mode={call_mode}"
#         )
#         logger.info(f"Outbound call | to={to_number} | webhook={webhook_url}")

#         payload = {
#             "connection_id":               resolved_connection_id,
#             "to":                          to_number,
#             "from":                        resolved_from,
#             "webhook_url":                 webhook_url,
#             "webhook_url_method":          "POST",
#             # AMD removed — costs $0.002/call and extends ring billing duration
#         }
#         try:
#             async with _make_client() as client:
#                 resp = await client.post("/calls", json=payload)
#                 resp.raise_for_status()
#                 cid = resp.json()["data"]["call_control_id"]
#                 logger.info(f"Outbound call started → {to_number} | cid={cid}")
#                 return cid
#         except Exception as e:
#             logger.error(f"Telnyx outbound error: {e}")
#             return None

#     async def answer(self, call_control_id: str) -> bool:
#         return await self._cmd(call_control_id, "answer", {})

#     async def speak(
#         self,
#         call_control_id: str,
#         text: str,
#         voice: str = "Polly.Joanna",
#         language: str = "en-US",
#         client_state: Optional[str] = None,
#     ) -> bool:
#         payload: Dict = {
#             "payload":      text,
#             "payload_type": "text",
#             "voice":        voice,
#             "language":     language,
#             # NO service_level — premium TTS disables STT listener
#         }
#         if client_state:
#             payload["client_state"] = _b64(client_state)
#         return await self._cmd(call_control_id, "speak", payload)

#     async def gather(
#         self,
#         call_control_id: str,
#         prompt: str,
#         voice: str = "Polly.Joanna",
#         language: str = "en-US",
#         speech_timeout_ms: int = 8000,
#         speech_end_timeout_ms: int = 1500,
#         client_state: Optional[str] = None,
#     ) -> bool:
#         """
#         gather_using_speak: TTS prompt then listens.
#         NOT used in Deepgram flow — kept for fallback.
#         NO service_level, NO gather_type, NO inter_digit_timeout_millis.
#         """
#         payload: Dict = {
#             "payload":                   prompt,
#             "payload_type":              "text",
#             "voice":                     voice,
#             "language":                  language,
#             "speech_timeout_millis":     speech_timeout_ms,
#             "speech_end_timeout_millis": speech_end_timeout_ms,
#         }
#         if client_state:
#             payload["client_state"] = _b64(client_state)
#         return await self._cmd(call_control_id, "gather_using_speak", payload)

#     async def start_streaming(
#         self,
#         call_control_id: str,
#         stream_url: str,
#         client_state: Optional[str] = None,
#     ) -> bool:
#         """
#         Start Telnyx media streaming.
#         stream_url must be wss://.
#         stream_track=inbound_track = caller audio only (not TTS).
#         """
#         payload: Dict = {
#             "stream_url":   stream_url,
#             "stream_track": "inbound_track",
#         }
#         if client_state:
#             payload["client_state"] = _b64(client_state)
#         logger.info(f"start_streaming → {stream_url} | cid={call_control_id[:12]}")
#         return await self._cmd(call_control_id, "streaming_start", payload)

#     async def stop_streaming(self, call_control_id: str) -> bool:
#         return await self._cmd(call_control_id, "streaming_stop", {})

#     async def hangup(self, call_control_id: str) -> bool:
#         return await self._cmd(call_control_id, "hangup", {})

#     async def reject(self, call_control_id: str, cause: str = "USER_BUSY") -> bool:
#         return await self._cmd(call_control_id, "reject", {"cause": cause})

#     async def transfer(self, call_control_id: str, to_number: str) -> bool:
#         return await self._cmd(call_control_id, "transfer", {
#             "to": to_number, "from": self._get_phone_number(),
#         })

#     async def get_numbers(self) -> List[Dict]:
#         try:
#             async with _make_client() as client:
#                 resp = await client.get("/phone_numbers?filter[status]=active&page[size]=50")
#                 resp.raise_for_status()
#                 return [
#                     {"id": n["id"], "number": n["phone_number"], "status": n["status"]}
#                     for n in resp.json().get("data", [])
#                 ]
#         except Exception as e:
#             logger.error(f"Get numbers error: {e}")
#             return []

#     async def _cmd(self, call_control_id: str, action: str, payload: Dict) -> bool:
#         try:
#             async with _make_client() as client:
#                 resp = await client.post(
#                     f"/calls/{call_control_id}/actions/{action}", json=payload
#                 )
#                 resp.raise_for_status()
#                 logger.info(f"Telnyx [{action}] OK | cid={call_control_id[:12]}")
#                 return True
#         except httpx.HTTPStatusError as e:
#             logger.error(
#                 f"Telnyx [{action}] HTTP {e.response.status_code}: "
#                 f"{e.response.text[:300]} | cid={call_control_id[:12]}"
#             )
#             return False
#         except Exception as e:
#             logger.error(f"Telnyx [{action}] error: {e} | cid={call_control_id[:12]}")
#             return False


# class CallSessionManager:
#     SESSION_TTL = 7200

#     async def create(self, call_control_id: str, company_id: str,
#                      lead_id: Optional[str], direction: str,
#                      mode: str, call_log_id: str) -> Dict:
#         from app.core.redis_client import redis_client
#         session = {
#             "call_control_id": call_control_id,
#             "company_id":      company_id,
#             "lead_id":         lead_id,
#             "direction":       direction,
#             "mode":            mode,
#             "call_log_id":     call_log_id,
#             "history":         [],
#             "started_at":      datetime.utcnow().isoformat(),
#             "turn_count":      0,
#         }
#         await redis_client.set(f"call:{call_control_id}", session, expire=self.SESSION_TTL)
#         logger.info(f"Session created | cid={call_control_id[:12]} | company={company_id} | mode={mode}")
#         return session

#     async def get(self, call_control_id: str) -> Optional[Dict]:
#         from app.core.redis_client import redis_client
#         return await redis_client.get(f"call:{call_control_id}")

#     async def add_turn(self, call_control_id: str, role: str, content: str):
#         from app.core.redis_client import redis_client
#         session = await self.get(call_control_id)
#         if session:
#             session["history"].append({"role": role, "content": content})
#             session["turn_count"] = session.get("turn_count", 0) + 1
#             await redis_client.set(f"call:{call_control_id}", session, expire=self.SESSION_TTL)

#     async def end(self, call_control_id: str) -> Optional[Dict]:
#         from app.core.redis_client import redis_client
#         session = await self.get(call_control_id)
#         await redis_client.delete(f"call:{call_control_id}")
#         return session

#     async def set_live_transcript(self, call_control_id: str, text: str):
#         from app.core.redis_client import redis_client
#         await redis_client.set(f"transcript:{call_control_id}", text, expire=120)

#     async def get_live_transcript(self, call_control_id: str) -> str:
#         from app.core.redis_client import redis_client
#         return await redis_client.get(f"transcript:{call_control_id}") or ""


# telnyx_service  = TelnyxService()
# session_manager = CallSessionManager()


"""
Telnyx Call Control API Service
- Shared, connection-pooled httpx client reused across requests (avoids a
  fresh TCP+TLS handshake to Telnyx on every action)
- client_state is base64-encoded on send (Telnyx requirement)
- Path stripping on webhook base URL
"""
import base64
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)
TELNYX_BASE = "https://api.telnyx.com/v2"

VOICE_MAP = {
    ("en-US", "female"): "Polly.Joanna",
    ("en-US", "male"):   "Polly.Matthew",
    ("en-IN", "female"): "Polly.Aditi",
    ("en-IN", "male"):   "Polly.Raveena",
    ("hi-IN", "female"): "Polly.Aditi",
    ("hi-IN", "male"):   "Polly.Raveena",
    ("en-GB", "female"): "Polly.Emma",
    ("en-GB", "male"):   "Polly.Brian",
}

ASR_LANGUAGE_MAP = {
    "en-US": "en-US",
    "en-IN": "en-IN",
    "en-GB": "en-GB",
    "hi-IN": "hi-IN",
}


def _b64(s: str) -> str:
    """Telnyx requires client_state to be base64-encoded."""
    return base64.b64encode(s.encode()).decode()


def get_telnyx_voice(company: Any) -> str:
    lang   = (getattr(company, "voice_language", None) or "en-US")
    gender = (getattr(company, "voice_gender",   None) or "female").lower()
    return VOICE_MAP.get((lang, gender), "Polly.Joanna")


def get_asr_language(company: Any) -> str:
    lang = (getattr(company, "voice_language", None) or "en-US")
    return ASR_LANGUAGE_MAP.get(lang, "en-US")


def _get_base_url() -> str:
    """
    Returns clean root URL — strips any path accidentally in env var.
    e.g. https://abc.trycloudflare.com/api/v1/telephony/webhook
      →  https://abc.trycloudflare.com
    """
    from app.core.config import settings
    base = (settings.TELNYX_WEBHOOK_BASE_URL or "http://localhost:8000").rstrip("/")
    for suffix in ["/api/v1/telephony/webhook", "/api/v1/telephony", "/api/v1", "/api"]:
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return base


_shared_client: Optional[httpx.AsyncClient] = None


async def _get_client() -> httpx.AsyncClient:
    """
    Shared, connection-pooled client reused across every Telnyx API call.
    Previously each call opened a brand-new client (fresh TCP+TLS handshake
    to api.telnyx.com) and tore it down immediately after — this was adding
    several hundred ms of latency to every single conversational turn
    (speak, answer, streaming_start, hangup all paid this cost separately).
    Reusing one pooled client lets httpx keep the connection alive so only
    the first request per process pays the handshake.
    """
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        from app.core.config import settings
        _shared_client = httpx.AsyncClient(
            base_url=TELNYX_BASE,
            headers={
                "Authorization": f"Bearer {settings.TELNYX_API_KEY or ''}",
                "Content-Type":  "application/json",
            },
            timeout=20.0,
        )
    return _shared_client


class TelnyxService:

    def _get_connection_id(self) -> str:
        from app.core.config import settings
        return settings.TELNYX_CONNECTION_ID or ""

    def _get_phone_number(self) -> str:
        from app.core.config import settings
        return settings.TELNYX_PHONE_NUMBER or ""

    async def make_outbound_call(
        self,
        to_number: str,
        company_id: str,
        lead_id: Optional[str] = None,
        call_mode: str = "sales",
        from_number: Optional[str] = None,
        connection_id: Optional[str] = None,
    ) -> Optional[str]:
        resolved_connection_id = connection_id or self._get_connection_id()
        if not resolved_connection_id:
            logger.error(f"No connection_id for company={company_id} — set TELNYX_CONNECTION_ID")
            return None

        resolved_from = from_number or self._get_phone_number()
        if not resolved_from:
            logger.error(f"No from-number for company={company_id} — set TELNYX_PHONE_NUMBER")
            return None

        webhook_url = (
            f"{_get_base_url()}/api/v1/telephony/webhook"
            f"?company_id={company_id}&lead_id={lead_id or ''}&mode={call_mode}"
        )
        logger.info(f"Outbound call | to={to_number} | webhook={webhook_url}")

        payload = {
            "connection_id":               resolved_connection_id,
            "to":                          to_number,
            "from":                        resolved_from,
            "webhook_url":                 webhook_url,
            "webhook_url_method":          "POST",
            "answering_machine_detection": "detect_beep",
        }
        try:
            client = await _get_client()
            resp = await client.post("/calls", json=payload)
            resp.raise_for_status()
            cid = resp.json()["data"]["call_control_id"]
            logger.info(f"Outbound call started → {to_number} | cid={cid}")
            return cid
        except Exception as e:
            logger.error(f"Telnyx outbound error: {e}")
            return None

    async def answer(self, call_control_id: str) -> bool:
        return await self._cmd(call_control_id, "answer", {})

    async def speak(
        self,
        call_control_id: str,
        text: str,
        voice: str = "Polly.Joanna",
        language: str = "en-US",
        client_state: Optional[str] = None,
    ) -> bool:
        payload: Dict = {
            "payload":      text,
            "payload_type": "text",
            "voice":        voice,
            "language":     language,
            # NO service_level — premium TTS disables STT listener
        }
        if client_state:
            payload["client_state"] = _b64(client_state)
        return await self._cmd(call_control_id, "speak", payload)

    async def gather(
        self,
        call_control_id: str,
        prompt: str,
        voice: str = "Polly.Joanna",
        language: str = "en-US",
        speech_timeout_ms: int = 8000,
        speech_end_timeout_ms: int = 1500,
        client_state: Optional[str] = None,
    ) -> bool:
        """
        gather_using_speak: TTS prompt then listens.
        NOT used in Deepgram flow — kept for fallback.
        NO service_level, NO gather_type, NO inter_digit_timeout_millis.
        """
        payload: Dict = {
            "payload":                   prompt,
            "payload_type":              "text",
            "voice":                     voice,
            "language":                  language,
            "speech_timeout_millis":     speech_timeout_ms,
            "speech_end_timeout_millis": speech_end_timeout_ms,
        }
        if client_state:
            payload["client_state"] = _b64(client_state)
        return await self._cmd(call_control_id, "gather_using_speak", payload)

    async def start_streaming(
        self,
        call_control_id: str,
        stream_url: str,
        client_state: Optional[str] = None,
    ) -> bool:
        """
        Start Telnyx media streaming.
        stream_url must be wss://.
        stream_track=inbound_track = caller audio only (not TTS).
        """
        payload: Dict = {
            "stream_url":   stream_url,
            "stream_track": "inbound_track",
        }
        if client_state:
            payload["client_state"] = _b64(client_state)
        logger.info(f"start_streaming → {stream_url} | cid={call_control_id[:12]}")
        return await self._cmd(call_control_id, "streaming_start", payload)

    async def stop_streaming(self, call_control_id: str) -> bool:
        return await self._cmd(call_control_id, "streaming_stop", {})

    async def gather_dtmf(
        self,
        call_control_id: str,
        min_digits: int = 1,
        max_digits: int = 1,
        timeout_millis: int = 8000,
        terminating_digit: str = "#",
        client_state: Optional[str] = None,
    ) -> bool:
        """
        Listen for keypad (DTMF) input without playing a prompt — pair this
        with a preceding speak() call that says "press 2 for...". Telnyx
        fires call.dtmf.received per-digit and call.gather.ended when done.
        """
        payload: Dict = {
            "minimum_digits":    min_digits,
            "maximum_digits":    max_digits,
            "timeout_millis":    timeout_millis,
            "terminating_digit": terminating_digit,
        }
        if client_state:
            payload["client_state"] = _b64(client_state)
        return await self._cmd(call_control_id, "gather", payload)

    async def hangup(self, call_control_id: str) -> bool:
        return await self._cmd(call_control_id, "hangup", {})

    async def reject(self, call_control_id: str, cause: str = "USER_BUSY") -> bool:
        return await self._cmd(call_control_id, "reject", {"cause": cause})

    async def transfer(self, call_control_id: str, to_number: str) -> bool:
        return await self._cmd(call_control_id, "transfer", {
            "to": to_number, "from": self._get_phone_number(),
        })

    async def get_numbers(self) -> List[Dict]:
        try:
            client = await _get_client()
            resp = await client.get("/phone_numbers?filter[status]=active&page[size]=50")
            resp.raise_for_status()
            return [
                {"id": n["id"], "number": n["phone_number"], "status": n["status"]}
                for n in resp.json().get("data", [])
            ]
        except Exception as e:
            logger.error(f"Get numbers error: {e}")
            return []

    async def _cmd(self, call_control_id: str, action: str, payload: Dict) -> bool:
        try:
            client = await _get_client()
            resp = await client.post(
                f"/calls/{call_control_id}/actions/{action}", json=payload
            )
            resp.raise_for_status()
            logger.info(f"Telnyx [{action}] OK | cid={call_control_id[:12]}")
            return True
        except httpx.HTTPStatusError as e:
            logger.error(
                f"Telnyx [{action}] HTTP {e.response.status_code}: "
                f"{e.response.text[:300]} | cid={call_control_id[:12]}"
            )
            return False
        except Exception as e:
            logger.error(f"Telnyx [{action}] error: {e} | cid={call_control_id[:12]}")
            return False


class CallSessionManager:
    SESSION_TTL = 7200

    async def create(self, call_control_id: str, company_id: str,
                     lead_id: Optional[str], direction: str,
                     mode: str, call_log_id: str) -> Dict:
        from app.core.redis_client import redis_client
        session = {
            "call_control_id": call_control_id,
            "company_id":      company_id,
            "lead_id":         lead_id,
            "direction":       direction,
            "mode":            mode,
            "call_log_id":     call_log_id,
            "history":         [],
            "started_at":      datetime.utcnow().isoformat(),
            "turn_count":      0,
        }
        await redis_client.set(f"call:{call_control_id}", session, expire=self.SESSION_TTL)
        logger.info(f"Session created | cid={call_control_id[:12]} | company={company_id} | mode={mode}")
        return session

    async def get(self, call_control_id: str) -> Optional[Dict]:
        from app.core.redis_client import redis_client
        return await redis_client.get(f"call:{call_control_id}")

    async def add_turn(self, call_control_id: str, role: str, content: str):
        from app.core.redis_client import redis_client
        session = await self.get(call_control_id)
        if session:
            session["history"].append({"role": role, "content": content})
            session["turn_count"] = session.get("turn_count", 0) + 1
            await redis_client.set(f"call:{call_control_id}", session, expire=self.SESSION_TTL)

    async def mark_dtmf_offered(self, call_control_id: str):
        """Flag that the 'press 2 for human callback' offer has been made
        this call, so it's only offered once."""
        from app.core.redis_client import redis_client
        session = await self.get(call_control_id)
        if session:
            session["dtmf_offered"] = True
            await redis_client.set(f"call:{call_control_id}", session, expire=self.SESSION_TTL)

    async def set_interest_streak(self, call_control_id: str, count: int):
        """Persist the running count of turns where the LLM detected genuine
        buying interest (interested_now=true). Used to gate the DTMF
        'press 2 for human callback' offer — requires sustained interest,
        not just one enthusiastic word."""
        from app.core.redis_client import redis_client
        session = await self.get(call_control_id)
        if session:
            session["interest_streak"] = count
            await redis_client.set(f"call:{call_control_id}", session, expire=self.SESSION_TTL)

    async def end(self, call_control_id: str) -> Optional[Dict]:
        from app.core.redis_client import redis_client
        session = await self.get(call_control_id)
        await redis_client.delete(f"call:{call_control_id}")
        return session

    async def set_live_transcript(self, call_control_id: str, text: str):
        from app.core.redis_client import redis_client
        await redis_client.set(f"transcript:{call_control_id}", text, expire=120)

    async def get_live_transcript(self, call_control_id: str) -> str:
        from app.core.redis_client import redis_client
        return await redis_client.get(f"transcript:{call_control_id}") or ""


telnyx_service  = TelnyxService()
session_manager = CallSessionManager()