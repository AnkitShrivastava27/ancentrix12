# """
# Telnyx Webhook + Media WebSocket Handler — Deepgram STT

# Fix: Deepgram is pre-started at call.answered (muted during greeting),
# so it is fully connected before the caller speaks. Previously it only
# connected when the /media WS 'start' event arrived (~10s after greeting
# finished), causing the first caller utterance to be dropped entirely.

# Flow:
# 1. call.initiated  → create session, answer (inbound) / wait (outbound)
# 2. call.answered   → pre-start Deepgram (muted) + speak greeting (client_state="greeting")
# 3. call.speak.ended (greeting) → start media streaming + unmute Deepgram
# 4. /media WS       → receive mulaw audio → forward to Deepgram
# 5. Deepgram        → unmuted, fires transcripts immediately
# 6. _handle_transcript → LLM reply → speak (client_state="ai_reply")
# 7. call.speak.ended (ai_reply) → unmute Deepgram again
# 8. call.hangup     → stop Deepgram, save transcript, analyze, update lead
# """
# import asyncio
# import base64
# import json
# import logging
# from datetime import datetime
# from typing import Dict, Optional, Set

# from fastapi import APIRouter, BackgroundTasks, Depends, Request, WebSocket, WebSocketDisconnect
# from sqlalchemy import select

# from app.core.database import AsyncSessionLocal
# from app.core.security import get_current_active_user
# from app.models.models import CallLog, Company, Lead
# from app.services.llm.llm_service import llm_service
# from app.services.llm.rag_service import rag_service
# from app.services.stt.deepgram_service import deepgram_manager
# from app.core.redis_client import redis_client
# from app.services.telephony.telnyx_service import (
#     get_telnyx_voice,
#     _get_base_url,
#     session_manager,
#     telnyx_service,
# )

# logger  = logging.getLogger(__name__)
# router  = APIRouter()

# _hung_up:    Set[str]         = set()
# _responding: Dict[str, bool]  = {}


# def _decode_cs(raw: str) -> str:
#     if not raw:
#         return ""
#     try:
#         return base64.b64decode(raw).decode()
#     except Exception:
#         return raw


# def _media_ws_url() -> str:
#     base = _get_base_url()
#     ws   = base.replace("https://", "wss://").replace("http://", "ws://")
#     return f"{ws}/api/v1/telephony/media"


# def _make_transcript_callback(cid: str):
#     async def on_transcript(text: str, is_final: bool):
#         if not is_final or text == "__end__":
#             return
#         if cid in _hung_up or _responding.get(cid):
#             logger.debug(f"Transcript suppressed | cid={cid[:12]}")
#             return
#         logger.info(f"STT final: '{text[:120]}' | cid={cid[:12]}")
#         await _handle_transcript(cid, text)
#     return on_transcript


# @router.post("/webhook")
# async def webhook(
#     request: Request,
#     background_tasks: BackgroundTasks,
#     company_id: Optional[str] = None,
#     lead_id:    Optional[str] = None,
#     mode:       Optional[str] = "support",
# ):
#     try:
#         body = await request.json()
#     except Exception:
#         return {"result": "ok"}

#     event   = body.get("data", {}).get("event_type", "")
#     payload = body.get("data", {}).get("payload", {})
#     cid     = payload.get("call_control_id", "")

#     logger.info(f"Telnyx event: {event} | cid={cid[:12] if cid else '?'} | company={company_id}")

#     payload["_company_id"] = company_id
#     payload["_lead_id"]    = lead_id
#     payload["_mode"]       = mode or "support"

#     handlers = {
#         "call.initiated":               _on_initiated,
#         "call.answered":                _on_answered,
#         "call.speak.ended":             _on_speak_ended,
#         "call.hangup":                  _on_hangup,
#         "call.machine.detection.ended": _on_machine_detected,
#         "call.recording.saved":         _on_recording_saved,
#         "call.streaming.started":       _on_streaming_started,
#         "call.streaming.stopped":       _on_streaming_stopped,
#     }

#     handler = handlers.get(event)
#     if handler:
#         background_tasks.add_task(handler, payload)

#     return {"result": "ok"}


# @router.websocket("/media")
# async def media_websocket(ws: WebSocket):
#     await ws.accept()
#     cid = None

#     try:
#         async for raw in ws.iter_text():
#             try:
#                 msg   = json.loads(raw)
#                 mtype = msg.get("event", "")

#                 if mtype == "connected":
#                     logger.info("Telnyx media WS connected")

#                 elif mtype == "start":
#                     meta = msg.get("start", {})
#                     cid  = (meta.get("call_control_id")
#                             or meta.get("customParameters", {}).get("cid", ""))

#                     already_active = deepgram_manager.active(cid) if cid else False
#                     logger.info(
#                         f"Media stream started | cid={cid[:12] if cid else '?'} | "
#                         f"deepgram_already_active={already_active}"
#                     )

#                     if cid and not already_active:
#                         # Deepgram was not pre-started in _on_answered (e.g. inbound call
#                         # or pre-start failed) — start now as fallback, already unmuted
#                         # since greeting is done by the time streaming starts.
#                         session = await session_manager.get(cid)
#                         company = None
#                         if session:
#                             async with AsyncSessionLocal() as db:
#                                 company = await _get_company(session["company_id"], db)
#                         callback = _make_transcript_callback(cid)
#                         result = await deepgram_manager.start(cid, callback, company)
#                         logger.info(f"Deepgram start (fallback) result={result} | cid={cid[:12]}")
#                     elif cid and already_active:
#                         # Pre-started and muted during greeting — unmute now so caller audio
#                         # starts flowing into transcription immediately.
#                         logger.info(f"Deepgram pre-started — unmuting on media stream start | cid={cid[:12]}")
#                         deepgram_manager.unmute(cid)

#                 elif mtype == "media":
#                     # Always forward audio — Deepgram mute gate handles suppression internally.
#                     if cid:
#                         b64 = msg.get("media", {}).get("payload", "")
#                         if b64:
#                             await deepgram_manager.audio(cid, base64.b64decode(b64))

#                 elif mtype == "stop":
#                     logger.info(f"Media stream stopped | cid={cid[:12] if cid else '?'}")
#                     if cid:
#                         await deepgram_manager.stop(cid)

#             except json.JSONDecodeError:
#                 pass
#             except Exception as e:
#                 logger.error(f"Media WS error: {e}", exc_info=True)

#     except WebSocketDisconnect:
#         logger.info(f"Media WS disconnected | cid={cid[:12] if cid else '?'}")
#     finally:
#         if cid:
#             await deepgram_manager.stop(cid)


# async def _handle_transcript(cid: str, transcript: str):
#     if cid in _hung_up or _responding.get(cid):
#         return
#     _responding[cid] = True
#     try:
#         await _process_transcript(cid, transcript)
#     except Exception as e:
#         logger.error(f"_process_transcript error: {e} | cid={cid[:12]}", exc_info=True)
#     finally:
#         _responding.pop(cid, None)


# async def _process_transcript(cid: str, transcript: str):
#     if cid in _hung_up:
#         return

#     session = await session_manager.get(cid)
#     if not session:
#         logger.warning(f"_process_transcript: no session | cid={cid[:12]}")
#         return

#     cached  = await _get_call_cache(cid)
#     company = cached.get("company") if cached else None
#     lead    = cached.get("lead")    if cached else None

#     if not company:
#         async with AsyncSessionLocal() as db:
#             company = await _get_company(session["company_id"], db)
#             if not company:
#                 return
#             lead = await _get_lead(session.get("lead_id"), db) if session.get("lead_id") else None

#     if isinstance(company, dict):
#         from app.services.telephony.telnyx_service import VOICE_MAP
#         lang   = company.get("voice_language", "en-US")
#         gender = company.get("voice_gender", "female").lower()
#         voice  = VOICE_MAP.get((lang, gender), "Polly.Joanna")
#     else:
#         voice = get_telnyx_voice(company)
#         lang  = company.voice_language or "en-US"

#     deepgram_manager.mute(cid)

#     human_words = ["speak to a human", "talk to a person", "real agent", "manager", "supervisor"]
#     fwd = company.get("forward_number") if isinstance(company, dict) else company.forward_number
#     if any(w in transcript.lower() for w in human_words):
#         if fwd:
#             msg = "Sure, let me get someone from the team right now. One moment!"
#             await telnyx_service.speak(cid, msg, voice=voice, language=lang, client_state="transfer")
#             await telnyx_service.transfer(cid, fwd)
#             async with AsyncSessionLocal() as db:
#                 await _update_log(session["call_log_id"], {"transferred_to_human": True}, db)
#         return

#     await session_manager.add_turn(cid, "user", transcript)
#     await session_manager.set_live_transcript(cid, transcript)
#     session = await session_manager.get(cid)

#     import asyncio as _asyncio
#     now_iso = datetime.now().isoformat()

#     rag_context = ""
#     try:
#         rag_context = await rag_service.search(session["company_id"], transcript, n_results=3)
#         if rag_context:
#             logger.info(f"RAG hit: {len(rag_context)} chars | cid={cid[:12]}")
#     except Exception as e:
#         logger.debug(f"RAG search error: {e}")

#     company_obj = _DictObj(company) if isinstance(company, dict) else company
#     lead_obj2   = _DictObj(lead)    if isinstance(lead, dict)    else lead
#     if session["mode"] == "sales":
#         prompt = llm_service.build_outbound_prompt(company_obj, lead_obj2, rag_context)
#     else:
#         prompt = llm_service.build_inbound_prompt(company_obj, rag_context)

#     intent = _fast_intent_check(transcript)

#     if intent is None:
#         reply_task  = _asyncio.create_task(
#             llm_service.generate_response(
#                 messages=session["history"],
#                 system_prompt=prompt,
#                 max_tokens=65,
#                 temperature=0.9,
#             )
#         )
#         intent_task = _asyncio.create_task(
#             llm_service.detect_callback_intent(transcript, session["history"], now_iso)
#         )
#         results = await _asyncio.gather(reply_task, intent_task, return_exceptions=True)
#         reply  = results[0] if not isinstance(results[0], Exception) else "Hmm, give me just a second."
#         intent = results[1] if not isinstance(results[1], Exception) else {"wants_callback": False, "wants_to_end": False, "confidence": 0.0}
#     else:
#         try:
#             reply = await llm_service.generate_response(
#                 messages=session["history"],
#                 system_prompt=prompt,
#                 max_tokens=65,
#                 temperature=0.9,
#             )
#         except Exception as e:
#             logger.error(f"LLM reply error: {e}")
#             reply = "Hmm, give me just a second."

#     logger.info(f"AI reply: '{str(reply)[:80]}' | cid={cid[:12]}")
#     logger.info(f"Intent: callback={intent.get('wants_callback')} end={intent.get('wants_to_end')} | cid={cid[:12]}")

#     if cid in _hung_up:
#         return

#     if intent.get("wants_callback") and intent.get("confidence", 0) >= 0.7:
#         callback_dt = _parse_callback_datetime(intent.get("callback_datetime_iso"))
#         if callback_dt and session.get("lead_id"):
#             async with AsyncSessionLocal() as db:
#                 lead_obj = await _get_lead(session["lead_id"], db)
#                 if lead_obj:
#                     lead_obj.scheduled_call_at = callback_dt
#                     lead_obj.status = "contacted"
#                     note = f"Requested callback: {intent.get('callback_time_raw', 'unspecified time')}"
#                     lead_obj.notes = f"{lead_obj.notes or ''}\n{note}".strip()
#                     await db.commit()
#                     logger.info(f"Callback scheduled | lead={session['lead_id']} | dt={callback_dt} | cid={cid[:12]}")

#         await session_manager.add_turn(cid, "assistant", str(reply))
#         await telnyx_service.speak(cid, str(reply), voice=voice, language=lang, client_state="farewell")
#         await telnyx_service.hangup(cid)
#         return

#     if intent.get("wants_to_end") and intent.get("confidence", 0) >= 0.9:
#         farewell = str(reply)
#         await session_manager.add_turn(cid, "assistant", farewell)
#         await telnyx_service.speak(cid, farewell, voice=voice, language=lang, client_state="farewell")
#         await telnyx_service.hangup(cid)
#         return

#     await session_manager.add_turn(cid, "assistant", str(reply))
#     await telnyx_service.speak(cid, str(reply), voice=voice, language=lang, client_state="ai_reply")


# async def _on_initiated(payload: dict):
#     cid        = payload["call_control_id"]
#     direction  = payload.get("direction", "inbound")
#     company_id = payload.get("_company_id")
#     _hung_up.discard(cid)
#     _responding.pop(cid, None)

#     logger.info(
#         f"call.initiated | direction={direction!r} | from={payload.get('from')} | "
#         f"to={payload.get('to')} | company_id={company_id} | cid={cid[:12]}"
#     )

#     if direction in ("outbound", "outgoing") or company_id:
#         logger.info(f"Outbound call.initiated — waiting for remote to answer | cid={cid[:12]}")
#         return

#     from_num = payload.get("from", "")
#     to_num   = payload.get("to", "")

#     async with AsyncSessionLocal() as db:
#         result  = await db.execute(select(Company).where(Company.telnyx_phone_number == to_num))
#         company = result.scalar_one_or_none()
#         if not company:
#             logger.warning(f"No company for DID {to_num} — rejecting")
#             await telnyx_service.reject(cid)
#             return

#         lead = await _find_lead_by_phone(from_num, company.id, db)
#         call_log = CallLog(
#             company_id=company.id, lead_id=lead.id if lead else None,
#             direction="inbound", status="ringing", mode="support",
#             from_number=from_num, to_number=to_num,
#             call_control_id=cid, started_at=datetime.utcnow(),
#         )
#         db.add(call_log)
#         await db.commit()
#         await db.refresh(call_log)

#         await session_manager.create(
#             call_control_id=cid, company_id=company.id,
#             lead_id=lead.id if lead else None,
#             direction="inbound", mode="support", call_log_id=call_log.id,
#         )
#         logger.info(f"Inbound session created | company={company.name} | cid={cid[:12]}")

#     await telnyx_service.answer(cid)


# async def _on_answered(payload: dict):
#     cid         = payload["call_control_id"]
#     company_id  = payload.get("_company_id")
#     lead_id     = payload.get("_lead_id")
#     mode        = payload.get("_mode", "support")
#     direction   = payload.get("direction", "inbound")
#     is_outbound = direction in ("outbound", "outgoing") or bool(company_id)

#     logger.info(f"call.answered | direction={direction!r} | is_outbound={is_outbound} | cid={cid[:12]}")

#     async with AsyncSessionLocal() as db:
#         session = await session_manager.get(cid)

#         if not session and is_outbound and company_id:
#             logger.info(f"Outbound answered — creating session | cid={cid[:12]}")
#             company = await _get_company(company_id, db)
#             lead    = await _get_lead(lead_id, db) if lead_id else None
#             if not company:
#                 logger.error(f"Company {company_id} not found — hanging up")
#                 await telnyx_service.hangup(cid)
#                 return

#             call_log = CallLog(
#                 company_id=company_id, lead_id=lead_id,
#                 direction="outbound", status="in_progress", mode=mode,
#                 from_number=company.telnyx_phone_number or "",
#                 to_number=lead.phone if lead else "",
#                 call_control_id=cid, started_at=datetime.utcnow(),
#             )
#             db.add(call_log)
#             await db.commit()
#             await db.refresh(call_log)

#             session = await session_manager.create(
#                 call_control_id=cid, company_id=company_id, lead_id=lead_id,
#                 direction="outbound", mode=mode, call_log_id=call_log.id,
#             )

#             if lead:
#                 lead.call_attempts  = (lead.call_attempts or 0) + 1
#                 lead.last_called_at = datetime.utcnow()
#                 if lead.status == "new":
#                     lead.status = "contacted"
#                 await db.commit()

#             if lead_id:
#                 try:
#                     preload = await redis_client.get(f"call_cache:preload:{lead_id}")
#                     if preload:
#                         await redis_client.set(f"call_cache:{cid}", preload, expire=600)
#                         await redis_client.delete(f"call_cache:preload:{lead_id}")
#                         logger.info(f"Call cache re-keyed | lead={lead_id} → cid={cid[:12]}")
#                 except Exception as e:
#                     logger.debug(f"Cache re-key error (non-fatal): {e}")

#             if lead_id:
#                 try:
#                     import redis as redis_sync
#                     from app.core.config import settings as _s
#                     _r = redis_sync.from_url(
#                         getattr(_s, "REDIS_URL", "redis://localhost:6379"),
#                         decode_responses=True,
#                     )
#                     batch_id_for_lead = _r.get(f"lead_batch:{lead_id}")
#                     if batch_id_for_lead:
#                         _r.setex(f"batch_call_active:{batch_id_for_lead}", 300, cid)
#                         logger.info(f"Batch lock updated | batch={batch_id_for_lead} | cid={cid[:12]}")
#                     else:
#                         logger.debug(f"No lead_batch key for lead={lead_id} — not a batch call")
#                 except Exception as e:
#                     logger.debug(f"Batch lock update error (non-fatal): {e}")

#         elif session:
#             await _update_log(session["call_log_id"], {"status": "in_progress"}, db)

#         if not session:
#             logger.warning(f"No session in _on_answered | cid={cid[:12]} — hanging up")
#             await telnyx_service.hangup(cid)
#             return

#         company = await _get_company(session["company_id"], db)
#         if not company:
#             await telnyx_service.hangup(cid)
#             return

#         agent = company.agent_name or "Alex"
#         if session["mode"] == "sales":
#             lead  = await _get_lead(session.get("lead_id"), db)
#             first = lead.name.split()[0] if lead and lead.name else ""
#             greeting = (
#                 company.greeting_outbound
#                 or f"Hey{' ' + first if first else ''}! This is {agent} calling from "
#                    f"{company.name}. Hope I'm not catching you at a bad time?"
#             )
#         else:
#             greeting = (
#                 company.greeting_inbound
#                 or f"Hey there! Thanks for calling {company.name}, I'm {agent}. What can I help you with today?"
#             )

#         voice = get_telnyx_voice(company)
#         lang  = company.voice_language or "en-US"

#     # ── FIX: Pre-start Deepgram NOW, muted during greeting ───────────────────
#     # Deepgram WS takes ~8-10s to connect. Starting it here during the greeting
#     # TTS means it's fully ready before the caller speaks. Without this, it only
#     # started when the /media WS 'start' event fired (~10s after greeting ended),
#     # causing the first caller utterance to be silently dropped.
#     try:
#         callback = _make_transcript_callback(cid)
#         started  = await deepgram_manager.start(cid, callback, company)
#         if started:
#             deepgram_manager.mute(cid)   # muted — AI is still speaking the greeting
#             logger.info(f"Deepgram pre-started and muted during greeting | cid={cid[:12]}")
#         else:
#             logger.warning(f"Deepgram pre-start failed — will retry on media stream start | cid={cid[:12]}")
#     except Exception as e:
#         logger.warning(f"Deepgram pre-start error (non-fatal): {e} | cid={cid[:12]}")

#     await session_manager.add_turn(cid, "assistant", greeting)
#     ok = await telnyx_service.speak(cid, greeting, voice=voice, language=lang, client_state="greeting")
#     if ok:
#         logger.info(f"Greeting sent | cid={cid[:12]} | voice={voice} | lang={lang}")
#     else:
#         logger.error(f"speak() FAILED for greeting | cid={cid[:12]}")


# async def _on_speak_ended(payload: dict):
#     """
#     TTS finished.
#     - greeting  → start media streaming; Deepgram was pre-started so just unmute on WS start
#     - ai_reply  → unmute Deepgram instantly (no reconnect)
#     - farewell/transfer/voicemail → terminal, do nothing
#     """
#     cid          = payload["call_control_id"]
#     client_state = _decode_cs(payload.get("client_state", ""))
#     reason       = payload.get("reason", "")

#     logger.info(f"speak.ended | state={client_state!r} | reason={reason!r} | cid={cid[:12]}")

#     if cid in _hung_up or reason == "call_hangup":
#         return
#     if client_state in ("farewell", "transfer", "voicemail"):
#         return

#     if client_state == "greeting":
#         stream_url = _media_ws_url()
#         ok = await telnyx_service.start_streaming(cid, stream_url)
#         if ok:
#             logger.info(f"Media streaming started → {stream_url} | cid={cid[:12]}")
#             # NOTE: Deepgram unmute happens in media_websocket when 'start' event
#             # arrives, because we need the WS to be open before audio can flow.
#             # deepgram_manager.unmute() is called there when already_active=True.
#         else:
#             logger.error(f"start_streaming FAILED | cid={cid[:12]}")
#         return

#     if client_state == "ai_reply":
#         # Unmute instantly — no reconnect, no delay
#         _responding.pop(cid, None)
#         deepgram_manager.unmute(cid)
#         logger.info(f"Deepgram unmuted after ai_reply | cid={cid[:12]}")
#         return

#     logger.debug(f"speak.ended unhandled state={client_state!r} | cid={cid[:12]}")


# async def _on_streaming_started(payload: dict):
#     cid = payload["call_control_id"]
#     logger.info(f"Telnyx confirmed streaming active | cid={cid[:12]}")


# async def _on_streaming_stopped(payload: dict):
#     cid = payload["call_control_id"]
#     logger.info(f"Telnyx streaming stopped | cid={cid[:12]}")
#     await deepgram_manager.stop(cid)


# async def _on_machine_detected(payload: dict):
#     cid    = payload["call_control_id"]
#     result = payload.get("result", "")

#     if result in ("machine_start", "machine_end_beep", "machine_end_silence"):
#         voice = "Polly.Joanna"
#         lang  = "en-US"
#         msg   = "Hey, we tried to reach you. Please call us back when you get a chance. Thanks!"

#         session = await session_manager.get(cid)
#         if session:
#             async with AsyncSessionLocal() as db:
#                 company = await _get_company(session["company_id"], db)
#                 if company:
#                     agent = company.agent_name or "Alex"
#                     msg   = (
#                         f"Hey, this is {agent} from {company.name}. "
#                         f"We had something important to share with you. "
#                         f"Give us a call back when you get a chance. Thanks!"
#                     )
#                     voice = get_telnyx_voice(company)
#                     lang  = company.voice_language or "en-US"
#                     await _update_log(session.get("call_log_id"), {"status": "no_answer"}, db)

#         await telnyx_service.speak(cid, msg, voice=voice, language=lang, client_state="voicemail")
#         await telnyx_service.stop_streaming(cid)
#         await telnyx_service.hangup(cid)


# async def _on_recording_saved(payload: dict):
#     cid = payload["call_control_id"]
#     url = payload.get("recording_urls", {}).get("mp3", "")
#     session = await session_manager.get(cid)
#     if session and session.get("call_log_id"):
#         async with AsyncSessionLocal() as db:
#             await _update_log(session["call_log_id"], {"recording_url": url}, db)


# async def _on_hangup(payload: dict):
#     cid = payload["call_control_id"]
#     _hung_up.add(cid)
#     _responding.pop(cid, None)

#     await deepgram_manager.stop(cid)
#     await _clear_call_cache(cid)

#     # Get lead_id from session — NOT from URL payload.
#     # When the receiver hangs up, Telnyx sends call.hangup without query params,
#     # so payload.get("_lead_id") is None. The session always has the correct lead_id.
#     # We end the session after the batch lock clear so we can read lead_id from it.
#     session = await session_manager.end(cid)

#     # Determine lead_id: prefer session, fall back to URL param
#     session_lead_id = session.get("lead_id") if session else None
#     url_lead_id     = payload.get("_lead_id")
#     lead_id_for_lock = session_lead_id or url_lead_id

#     if lead_id_for_lock:
#         try:
#             import redis as redis_sync
#             from app.core.config import settings as _s
#             _r = redis_sync.from_url(
#                 getattr(_s, "REDIS_URL", "redis://localhost:6379"),
#                 decode_responses=True,
#             )
#             batch_id_for_lead = _r.get(f"lead_batch:{lead_id_for_lock}")
#             if batch_id_for_lead:
#                 _r.delete(f"batch_call_active:{batch_id_for_lead}")
#                 _r.delete(f"lead_batch:{lead_id_for_lock}")
#                 logger.info(f"Batch lock cleared | batch={batch_id_for_lead} | cid={cid[:12]}")
#             else:
#                 logger.debug(f"No lead_batch key on hangup for lead={lead_id_for_lock}")
#         except Exception as e:
#             logger.debug(f"Batch lock clear error (non-fatal): {e}")

#     if not session:
#         return

#     history     = session.get("history", [])
#     call_log_id = session.get("call_log_id")
#     lead_id     = session.get("lead_id")
#     company_id  = session["company_id"]

#     transcript = "\n".join([
#         f"{'Agent' if m['role'] == 'assistant' else 'Caller'}: {m['content']}"
#         for m in history
#     ])

#     analysis = {}
#     if transcript:
#         async with AsyncSessionLocal() as db:
#             company = await _get_company(company_id, db)
#         if company:
#             try:
#                 analysis = await llm_service.analyze_call(
#                     transcript, f"{company.name} — {company.description or ''}"
#                 )
#             except Exception as e:
#                 logger.error(f"Analysis error: {e}")

#     duration = 0
#     if session.get("started_at"):
#         try:
#             started  = datetime.fromisoformat(session["started_at"])
#             duration = int((datetime.utcnow() - started).total_seconds())
#         except Exception:
#             pass

#     async with AsyncSessionLocal() as db:
#         await _update_log(call_log_id, {
#             "status":               "completed",
#             "ended_at":             datetime.utcnow(),
#             "duration_seconds":     duration,
#             "conversation_history": history,
#             "transcript":           transcript,
#             "summary":              analysis.get("summary", ""),
#             "sentiment":            analysis.get("sentiment", ""),
#             "intent":               analysis.get("intent", ""),
#             "lead_status_after":    analysis.get("lead_status", ""),
#             "transferred_to_human": analysis.get("transferred_to_human", False),
#         }, db)

#         if lead_id:
#             lead = await _get_lead(lead_id, db)
#             if lead:
#                 new_status = analysis.get("lead_status")
#                 valid = ["new","contacted","interested","warm","cold","closed_won","closed_lost","do_not_call"]
#                 if new_status and new_status in valid:
#                     lead.status = new_status
#                 interest = analysis.get("interest_level")
#                 if interest is not None:
#                     lead.interest_level = float(interest)
#                 key_info = analysis.get("key_info", {})
#                 if key_info:
#                     lead.key_info = {**(lead.key_info or {}), **{k: v for k, v in key_info.items() if v}}
#                 lead.updated_at = datetime.utcnow()
#                 await db.commit()

#     logger.info(f"Call ended | cid={cid[:12]} | {duration}s | status={analysis.get('lead_status')}")

#     # ── Deduct platform minutes ───────────────────────────────────────────────
#     if duration > 0:
#         try:
#             from app.services.minutes_service import deduct_minutes as _deduct
#             from firebase_admin_init import get_db as _get_firestore
#             fs = _get_firestore()
#             users_ref = fs.collection("users")
#             query     = users_ref.where("company_id", "==", company_id).limit(1).stream()
#             uid       = None
#             for doc in query:
#                 uid = doc.id
#                 break

#             if uid:
#                 _deduct(uid=uid, duration_seconds=duration)
#                 logger.info(f"Minutes deducted | uid={uid} | seconds={duration} | cid={cid[:12]}")
#             else:
#                 logger.warning(f"No Firestore user found for company_id={company_id} — minutes not deducted")
#         except Exception as e:
#             logger.warning(f"Minutes deduction error (non-fatal): {e}")

#     await asyncio.sleep(30)
#     _hung_up.discard(cid)


# @router.get("/numbers")
# async def list_numbers(current_user=Depends(get_current_active_user)):
#     return await telnyx_service.get_numbers()

# @router.post("/calls/{cid}/hangup")
# async def force_hangup(cid: str, current_user=Depends(get_current_active_user)):
#     return {"success": await telnyx_service.hangup(cid)}

# @router.get("/calls/{cid}/transcript")
# async def live_transcript(cid: str, current_user=Depends(get_current_active_user)):
#     return {"transcript": await session_manager.get_live_transcript(cid)}

# @router.post("/test-call")
# async def test_outbound_call(request: Request, current_user=Depends(get_current_active_user)):
#     body      = await request.json()
#     to_number = body.get("to_number")
#     company_id= body.get("company_id")
#     lead_id   = body.get("lead_id")
#     call_mode = body.get("call_mode", "sales")
#     if not to_number or not company_id:
#         return {"error": "to_number and company_id required"}
#     cid = await telnyx_service.make_outbound_call(
#         to_number=to_number, company_id=company_id,
#         lead_id=lead_id, call_mode=call_mode,
#     )
#     return {"call_control_id": cid, "status": "dialing" if cid else "failed"}


# # ── Helpers ───────────────────────────────────────────────────────────────────

# class _DictObj:
#     def __init__(self, d: dict):
#         self._d = d or {}
#     def __getattr__(self, name):
#         return self._d.get(name)


# async def _get_company(company_id: str, db) -> Optional[Company]:
#     r = await db.execute(select(Company).where(Company.id == company_id))
#     return r.scalar_one_or_none()

# async def _get_lead(lead_id: Optional[str], db) -> Optional[Lead]:
#     if not lead_id:
#         return None
#     r = await db.execute(select(Lead).where(Lead.id == lead_id))
#     return r.scalar_one_or_none()

# async def _find_lead_by_phone(phone: str, company_id: str, db) -> Optional[Lead]:
#     r = await db.execute(
#         select(Lead).where(Lead.phone == phone, Lead.company_id == company_id)
#     )
#     return r.scalar_one_or_none()

# async def _update_log(call_log_id: Optional[str], updates: dict, db):
#     if not call_log_id:
#         return
#     r = await db.execute(select(CallLog).where(CallLog.id == call_log_id))
#     log = r.scalar_one_or_none()
#     if log:
#         for k, v in updates.items():
#             setattr(log, k, v)
#         log.updated_at = datetime.utcnow()
#         await db.commit()


# async def preload_call_cache(cid: str, company_id: str, lead_id: Optional[str]):
#     try:
#         async with AsyncSessionLocal() as db:
#             company = await _get_company(company_id, db)
#             lead    = await _get_lead(lead_id, db) if lead_id else None

#         if not company:
#             logger.warning(f"preload_call_cache: company {company_id} not found")
#             return

#         cache = {
#             "company":     _company_to_dict(company),
#             "lead":        _lead_to_dict(lead) if lead else None,
#             "rag_context": "",
#         }
#         await redis_client.set(f"call_cache:{cid}", cache, expire=600)
#         logger.info(f"Call cache preloaded | cid={cid[:12] if cid else '?'}")
#     except Exception as e:
#         logger.warning(f"preload_call_cache error: {e}")


# async def _get_call_cache(cid: str) -> Optional[Dict]:
#     try:
#         return await redis_client.get(f"call_cache:{cid}")
#     except Exception:
#         return None


# async def _clear_call_cache(cid: str):
#     try:
#         await redis_client.delete(f"call_cache:{cid}")
#     except Exception:
#         pass


# def _company_to_dict(company) -> Dict:
#     return {
#         "id":                    company.id,
#         "name":                  company.name,
#         "description":           company.description or "",
#         "services":              company.services or "",
#         "faqs":                  company.faqs or "",
#         "products":              company.products or [],
#         "active_product":        company.active_product,
#         "agent_name":            company.agent_name or "Aria",
#         "voice_language":        company.voice_language or "en-US",
#         "voice_gender":          company.voice_gender or "female",
#         "forward_number":        company.forward_number,
#         "inbound_system_prompt": company.inbound_system_prompt,
#         "outbound_sales_prompt": company.outbound_sales_prompt,
#         "greeting_inbound":      company.greeting_inbound,
#         "greeting_outbound":     company.greeting_outbound,
#         "telnyx_phone_number":   company.telnyx_phone_number,
#     }


# def _lead_to_dict(lead) -> Optional[Dict]:
#     if not lead:
#         return None
#     return {
#         "id":            lead.id,
#         "name":          lead.name,
#         "phone":         lead.phone,
#         "email":         lead.email,
#         "status":        lead.status,
#         "notes":         lead.notes or "",
#         "key_info":      lead.key_info or {},
#         "call_attempts": lead.call_attempts or 0,
#         "language":      lead.language or "english",
#         "timezone":      lead.timezone or "Asia/Kolkata",
#     }


# def _fast_intent_check(transcript: str) -> Optional[Dict]:
#     t = transcript.lower().strip()

#     # Never short-circuit on questions — "why did you call me?", "what do you want?"
#     # are engagement signals, not end-of-call signals. Let the LLM decide.
#     if "?" in t:
#         return None

#     # Clear, unambiguous end-of-call phrases only.
#     # Keep this list STRICT — false positives hang up on interested leads.
#     end_words = [
#         "bye","goodbye","good bye","bye bye","alvida","tata","ok bye","okay bye",
#         "not interested","koi zaroorat nahi","mujhe nahi chahiye",
#         "stop calling","dont call","don't call","remove my number",
#         "do not call","hang up","band karo",
#     ]
#     if any(w in t for w in end_words):
#         return {"wants_callback": False, "wants_to_end": True,
#                 "callback_time_raw": None, "callback_datetime_iso": None, "confidence": 0.95}

#     callback_words = [
#         "call me","call back","callback","baad mein","baad me",
#         "later","tomorrow","kal","next week","agli baar",
#         "morning","afternoon","evening","subah","dopahar","shaam",
#         "busy right now","abhi busy","not a good time","bad time",
#         "call me at","call me on","ring me",
#     ]
#     if any(w in t for w in callback_words):
#         return None

#     return {"wants_callback": False, "wants_to_end": False,
#             "callback_time_raw": None, "callback_datetime_iso": None, "confidence": 0.9}


# def _parse_callback_datetime(iso_str: Optional[str]):
#     if not iso_str:
#         return None
#     try:
#         from datetime import time as dtime
#         import pytz
#         tz = pytz.timezone("Asia/Kolkata")
#         dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
#         if dt.tzinfo:
#             dt = dt.astimezone(tz).replace(tzinfo=None)
#         window_start = dtime(9, 0)
#         window_end   = dtime(18, 0)
#         t = dt.time()
#         if t < window_start:
#             dt = dt.replace(hour=9, minute=0, second=0)
#         elif t > window_end:
#             from datetime import timedelta
#             dt = (dt + timedelta(days=1)).replace(hour=9, minute=0, second=0)
#         return dt
#     except Exception as e:
#         logger.debug(f"_parse_callback_datetime error: {e}")
#         return None

"""
Telnyx Webhook + Media WebSocket Handler — Deepgram STT

Fix: Deepgram is pre-started at call.answered (muted during greeting),
so it is fully connected before the caller speaks. Previously it only
connected when the /media WS 'start' event arrived (~10s after greeting
finished), causing the first caller utterance to be dropped entirely.

Flow:
1. call.initiated  → create session, answer (inbound) / wait (outbound)
2. call.answered   → pre-start Deepgram (muted) + speak greeting (client_state="greeting")
3. call.speak.ended (greeting) → start media streaming + unmute Deepgram
4. /media WS       → receive mulaw audio → forward to Deepgram
5. Deepgram        → unmuted, fires transcripts immediately
6. _handle_transcript → LLM reply → speak (client_state="ai_reply")
7. call.speak.ended (ai_reply) → unmute Deepgram again
8. call.hangup     → stop Deepgram, save transcript, analyze, update lead
"""
import asyncio
import base64
import json
import logging
from datetime import datetime
from typing import Dict, Optional, Set

from fastapi import APIRouter, BackgroundTasks, Depends, Request, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import get_current_active_user
from app.models.models import CallLog, Company, Lead
from app.services.llm.llm_service import llm_service
from app.services.llm.rag_service import rag_service
from app.services.stt.deepgram_service import deepgram_manager
from app.core.redis_client import redis_client
from app.services.telephony.telnyx_service import (
    get_telnyx_voice,
    _get_base_url,
    session_manager,
    telnyx_service,
)

logger  = logging.getLogger(__name__)
router  = APIRouter()

_hung_up:    Set[str]         = set()
_responding: Dict[str, bool]  = {}


def _decode_cs(raw: str) -> str:
    if not raw:
        return ""
    try:
        return base64.b64decode(raw).decode()
    except Exception:
        return raw


def _media_ws_url() -> str:
    base = _get_base_url()
    ws   = base.replace("https://", "wss://").replace("http://", "ws://")
    return f"{ws}/api/v1/telephony/media"


def _make_transcript_callback(cid: str):
    async def on_transcript(text: str, is_final: bool):
        if not is_final or text == "__end__":
            return
        if cid in _hung_up or _responding.get(cid):
            logger.debug(f"Transcript suppressed | cid={cid[:12]}")
            return
        logger.info(f"STT final: '{text[:120]}' | cid={cid[:12]}")
        await _handle_transcript(cid, text)
    return on_transcript


@router.post("/webhook")
async def webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    company_id: Optional[str] = None,
    lead_id:    Optional[str] = None,
    mode:       Optional[str] = "support",
):
    try:
        body = await request.json()
    except Exception:
        return {"result": "ok"}

    event   = body.get("data", {}).get("event_type", "")
    payload = body.get("data", {}).get("payload", {})
    cid     = payload.get("call_control_id", "")

    logger.info(f"Telnyx event: {event} | cid={cid[:12] if cid else '?'} | company={company_id}")

    payload["_company_id"] = company_id
    payload["_lead_id"]    = lead_id
    payload["_mode"]       = mode or "support"

    handlers = {
        "call.initiated":               _on_initiated,
        "call.answered":                _on_answered,
        "call.speak.ended":             _on_speak_ended,
        "call.hangup":                  _on_hangup,
        "call.machine.detection.ended": _on_machine_detected,
        "call.recording.saved":         _on_recording_saved,
        "call.streaming.started":       _on_streaming_started,
        "call.streaming.stopped":       _on_streaming_stopped,
        "call.dtmf.received":           _on_dtmf_received,
    }

    handler = handlers.get(event)
    if handler:
        background_tasks.add_task(handler, payload)

    return {"result": "ok"}


@router.websocket("/media")
async def media_websocket(ws: WebSocket):
    await ws.accept()
    cid = None

    try:
        async for raw in ws.iter_text():
            try:
                msg   = json.loads(raw)
                mtype = msg.get("event", "")

                if mtype == "connected":
                    logger.info("Telnyx media WS connected")

                elif mtype == "start":
                    meta = msg.get("start", {})
                    cid  = (meta.get("call_control_id")
                            or meta.get("customParameters", {}).get("cid", ""))

                    already_active = deepgram_manager.active(cid) if cid else False
                    logger.info(
                        f"Media stream started | cid={cid[:12] if cid else '?'} | "
                        f"deepgram_already_active={already_active}"
                    )

                    if cid and not already_active:
                        # Deepgram was not pre-started in _on_answered (e.g. inbound call
                        # or pre-start failed) — start now as fallback, already unmuted
                        # since greeting is done by the time streaming starts.
                        session = await session_manager.get(cid)
                        company = None
                        if session:
                            async with AsyncSessionLocal() as db:
                                company = await _get_company(session["company_id"], db)
                        callback = _make_transcript_callback(cid)
                        result = await deepgram_manager.start(cid, callback, company)
                        logger.info(f"Deepgram start (fallback) result={result} | cid={cid[:12]}")
                    elif cid and already_active:
                        # Pre-started and muted during greeting — unmute now so caller audio
                        # starts flowing into transcription immediately.
                        logger.info(f"Deepgram pre-started — unmuting on media stream start | cid={cid[:12]}")
                        deepgram_manager.unmute(cid)

                elif mtype == "media":
                    # Always forward audio — Deepgram mute gate handles suppression internally.
                    if cid:
                        b64 = msg.get("media", {}).get("payload", "")
                        if b64:
                            await deepgram_manager.audio(cid, base64.b64decode(b64))

                elif mtype == "stop":
                    logger.info(f"Media stream stopped | cid={cid[:12] if cid else '?'}")
                    if cid:
                        await deepgram_manager.stop(cid)

            except json.JSONDecodeError:
                pass
            except Exception as e:
                logger.error(f"Media WS error: {e}", exc_info=True)

    except WebSocketDisconnect:
        logger.info(f"Media WS disconnected | cid={cid[:12] if cid else '?'}")
    finally:
        if cid:
            await deepgram_manager.stop(cid)


async def _handle_transcript(cid: str, transcript: str):
    if cid in _hung_up or _responding.get(cid):
        return
    _responding[cid] = True
    try:
        await _process_transcript(cid, transcript)
    except Exception as e:
        logger.error(f"_process_transcript error: {e} | cid={cid[:12]}", exc_info=True)
    finally:
        _responding.pop(cid, None)


async def _process_transcript(cid: str, transcript: str):
    if cid in _hung_up:
        return

    session = await session_manager.get(cid)
    if not session:
        logger.warning(f"_process_transcript: no session | cid={cid[:12]}")
        return

    cached  = await _get_call_cache(cid)
    company = cached.get("company") if cached else None
    lead    = cached.get("lead")    if cached else None

    if not company:
        async with AsyncSessionLocal() as db:
            company = await _get_company(session["company_id"], db)
            if not company:
                return
            lead = await _get_lead(session.get("lead_id"), db) if session.get("lead_id") else None

    if isinstance(company, dict):
        from app.services.telephony.telnyx_service import VOICE_MAP
        lang   = company.get("voice_language", "en-US")
        gender = company.get("voice_gender", "female").lower()
        voice  = VOICE_MAP.get((lang, gender), "Polly.Joanna")
    else:
        voice = get_telnyx_voice(company)
        lang  = company.voice_language or "en-US"

    deepgram_manager.mute(cid)

    human_words = ["speak to a human", "talk to a person", "real agent", "manager", "supervisor"]
    fwd = company.get("forward_number") if isinstance(company, dict) else company.forward_number
    if any(w in transcript.lower() for w in human_words):
        if fwd:
            msg = "Sure, let me get someone from the team right now. One moment!"
            await telnyx_service.speak(cid, msg, voice=voice, language=lang, client_state="transfer")
            await telnyx_service.transfer(cid, fwd)
            async with AsyncSessionLocal() as db:
                await _update_log(session["call_log_id"], {"transferred_to_human": True}, db)
        return

    await session_manager.add_turn(cid, "user", transcript)
    await session_manager.set_live_transcript(cid, transcript)
    session = await session_manager.get(cid)

    import asyncio as _asyncio
    now_iso = datetime.now().isoformat()

    rag_context = ""
    try:
        rag_context = await rag_service.search(session["company_id"], transcript, n_results=3)
        if rag_context:
            logger.info(f"RAG hit: {len(rag_context)} chars | cid={cid[:12]}")
    except Exception as e:
        logger.debug(f"RAG search error: {e}")

    company_obj = _DictObj(company) if isinstance(company, dict) else company
    lead_obj2   = _DictObj(lead)    if isinstance(lead, dict)    else lead
    if session["mode"] == "sales":
        prompt = llm_service.build_outbound_prompt(company_obj, lead_obj2, rag_context)
    else:
        prompt = llm_service.build_inbound_prompt(company_obj, rag_context)

    intent = _fast_intent_check(transcript)

    if intent is None:
        reply_task  = _asyncio.create_task(
            llm_service.generate_response(
                messages=session["history"],
                system_prompt=prompt,
                max_tokens=120,
                temperature=0.9,
            )
        )
        intent_task = _asyncio.create_task(
            llm_service.detect_callback_intent(transcript, session["history"], now_iso)
        )
        results = await _asyncio.gather(reply_task, intent_task, return_exceptions=True)
        reply  = results[0] if not isinstance(results[0], Exception) else "Hmm, give me just a second."
        intent = results[1] if not isinstance(results[1], Exception) else {"wants_callback": False, "wants_to_end": False, "interested_now": False, "confidence": 0.0}
    else:
        try:
            reply = await llm_service.generate_response(
                messages=session["history"],
                system_prompt=prompt,
                max_tokens=120,
                temperature=0.9,
            )
        except Exception as e:
            logger.error(f"LLM reply error: {e}")
            reply = "Hmm, give me just a second."
        # _fast_intent_check short-circuited (keyword match, e.g. callback
        # phrase) — interested_now wasn't computed by the LLM this turn.
        intent.setdefault("interested_now", False)

    logger.info(f"AI reply: '{str(reply)[:80]}' | cid={cid[:12]}")
    logger.info(f"Intent: callback={intent.get('wants_callback')} end={intent.get('wants_to_end')} interested_now={intent.get('interested_now')} | cid={cid[:12]}")

    if cid in _hung_up:
        return

    if intent.get("wants_callback") and intent.get("confidence", 0) >= 0.85:
        callback_dt = _parse_callback_datetime(intent.get("callback_datetime_iso"))
        if callback_dt and session.get("lead_id"):
            async with AsyncSessionLocal() as db:
                lead_obj = await _get_lead(session["lead_id"], db)
                if lead_obj:
                    lead_obj.scheduled_call_at = callback_dt
                    lead_obj.status = "contacted"
                    note = f"Requested callback: {intent.get('callback_time_raw', 'unspecified time')}"
                    lead_obj.notes = f"{lead_obj.notes or ''}\n{note}".strip()
                    await db.commit()
                    logger.info(f"Callback scheduled | lead={session['lead_id']} | dt={callback_dt} | cid={cid[:12]}")

        await session_manager.add_turn(cid, "assistant", str(reply))
        await telnyx_service.speak(cid, str(reply), voice=voice, language=lang, client_state="farewell")
        await telnyx_service.hangup(cid)
        return

    if intent.get("wants_to_end") and intent.get("confidence", 0) >= 0.9:
        farewell = str(reply)
        await session_manager.add_turn(cid, "assistant", farewell)
        await telnyx_service.speak(cid, farewell, voice=voice, language=lang, client_state="farewell")
        await telnyx_service.hangup(cid)
        return

    # ── DTMF "press 2 for human callback" offer ───────────────────────────────
    # Fires only when BOTH conditions are met:
    #   1. The conversation has run for at least 4 caller turns (so we're not
    #      interrupting an early exchange before any real rapport/context).
    #   2. The lead has shown genuine interest at least twice across the call
    #      (interest_streak >= 2) — a single enthusiastic word isn't enough,
    #      this requires sustained positive engagement.
    # interested_now comes from the LLM's per-turn sentiment read on the
    # caller's own words (detect_callback_intent), not keyword matching —
    # more accurate than a fixed keyword list for genuine interest.
    if intent.get("interested_now"):
        session["interest_streak"] = session.get("interest_streak", 0) + 1
        await session_manager.set_interest_streak(cid, session["interest_streak"])

    interest_streak = session.get("interest_streak", 0)
    turn_count       = len([m for m in session["history"] if m["role"] == "user"])
    already_offered  = session.get("dtmf_offered", False)

    if (session["mode"] == "sales" and not already_offered
            and turn_count >= 4 and interest_streak >= 2
            and not intent.get("wants_to_end") and not intent.get("wants_callback")):
        reply_text = f"{str(reply)} Sounds like this could be a great fit — if you'd like, our team can call you back personally to walk through the details. Just press 2 on your keypad anytime."
        await session_manager.add_turn(cid, "assistant", reply_text)
        await session_manager.mark_dtmf_offered(cid)
        await telnyx_service.speak(cid, reply_text, voice=voice, language=lang, client_state="ai_reply")
        # Start listening for DTMF in parallel — does not block speech flow
        await telnyx_service.gather_dtmf(cid, min_digits=1, max_digits=1, timeout_millis=15000)
        return

    await session_manager.add_turn(cid, "assistant", str(reply))
    await telnyx_service.speak(cid, str(reply), voice=voice, language=lang, client_state="ai_reply")


async def _on_dtmf_received(payload: dict):
    """
    Telnyx fires this once per digit pressed during an active gather_dtmf().
    digit == "2" → caller wants a human callback. Confirm, log, and end the
    call gracefully. Any other digit is ignored (gather keeps listening).
    """
    cid    = payload["call_control_id"]
    digit  = payload.get("digit", "")
    logger.info(f"DTMF received | digit={digit!r} | cid={cid[:12]}")

    if digit != "2":
        return  # ignore other keys, gather continues listening

    if cid in _hung_up:
        return

    session = await session_manager.get(cid)
    if not session:
        return

    company_id = session["company_id"]
    lead_id    = session.get("lead_id")

    async with AsyncSessionLocal() as db:
        company = await _get_company(company_id, db)
        voice   = get_telnyx_voice(company) if company else "Polly.Joanna"
        lang    = company.voice_language if company else "en-US"

        if lead_id:
            lead = await _get_lead(lead_id, db)
            if lead:
                # Dedicated status — distinct from generic "interested" so your
                # team can filter specifically for "wants a callback" leads
                # without mixing in leads that merely sounded interested.
                lead.status = "human_callback_requested"
                note = "Pressed 2 during call — requested human callback"
                lead.notes = f"{lead.notes or ''}\n{note}".strip()
                await db.commit()
                logger.info(f"Lead marked human_callback_requested | lead={lead_id} | cid={cid[:12]}")

        await _update_log(session.get("call_log_id"), {"transferred_to_human": True}, db)

    msg = "Great choice! Someone from our team will call you back shortly. Thanks for your time, have a great day!"
    await session_manager.add_turn(cid, "assistant", msg)
    await telnyx_service.speak(cid, msg, voice=voice, language=lang, client_state="farewell")
    await telnyx_service.hangup(cid)


async def _on_initiated(payload: dict):
    cid        = payload["call_control_id"]
    direction  = payload.get("direction", "inbound")
    company_id = payload.get("_company_id")
    _hung_up.discard(cid)
    _responding.pop(cid, None)

    logger.info(
        f"call.initiated | direction={direction!r} | from={payload.get('from')} | "
        f"to={payload.get('to')} | company_id={company_id} | cid={cid[:12]}"
    )

    if direction in ("outbound", "outgoing") or company_id:
        logger.info(f"Outbound call.initiated — waiting for remote to answer | cid={cid[:12]}")
        return

    from_num = payload.get("from", "")
    to_num   = payload.get("to", "")

    async with AsyncSessionLocal() as db:
        result  = await db.execute(select(Company).where(Company.telnyx_phone_number == to_num))
        company = result.scalar_one_or_none()
        if not company:
            logger.warning(f"No company for DID {to_num} — rejecting")
            await telnyx_service.reject(cid)
            return

        lead = await _find_lead_by_phone(from_num, company.id, db)
        call_log = CallLog(
            company_id=company.id, lead_id=lead.id if lead else None,
            direction="inbound", status="ringing", mode="support",
            from_number=from_num, to_number=to_num,
            call_control_id=cid, started_at=datetime.utcnow(),
        )
        db.add(call_log)
        await db.commit()
        await db.refresh(call_log)

        await session_manager.create(
            call_control_id=cid, company_id=company.id,
            lead_id=lead.id if lead else None,
            direction="inbound", mode="support", call_log_id=call_log.id,
        )
        logger.info(f"Inbound session created | company={company.name} | cid={cid[:12]}")

    await telnyx_service.answer(cid)


async def _on_answered(payload: dict):
    cid         = payload["call_control_id"]
    company_id  = payload.get("_company_id")
    lead_id     = payload.get("_lead_id")
    mode        = payload.get("_mode", "support")
    direction   = payload.get("direction", "inbound")
    is_outbound = direction in ("outbound", "outgoing") or bool(company_id)

    logger.info(f"call.answered | direction={direction!r} | is_outbound={is_outbound} | cid={cid[:12]}")

    async with AsyncSessionLocal() as db:
        session = await session_manager.get(cid)

        if not session and is_outbound and company_id:
            logger.info(f"Outbound answered — creating session | cid={cid[:12]}")
            company = await _get_company(company_id, db)
            lead    = await _get_lead(lead_id, db) if lead_id else None
            if not company:
                logger.error(f"Company {company_id} not found — hanging up")
                await telnyx_service.hangup(cid)
                return

            call_log = CallLog(
                company_id=company_id, lead_id=lead_id,
                direction="outbound", status="in_progress", mode=mode,
                from_number=company.telnyx_phone_number or "",
                to_number=lead.phone if lead else "",
                call_control_id=cid, started_at=datetime.utcnow(),
            )
            db.add(call_log)
            await db.commit()
            await db.refresh(call_log)

            session = await session_manager.create(
                call_control_id=cid, company_id=company_id, lead_id=lead_id,
                direction="outbound", mode=mode, call_log_id=call_log.id,
            )

            if lead:
                lead.call_attempts  = (lead.call_attempts or 0) + 1
                lead.last_called_at = datetime.utcnow()
                if lead.status == "new":
                    lead.status = "contacted"
                await db.commit()

            if lead_id:
                try:
                    preload = await redis_client.get(f"call_cache:preload:{lead_id}")
                    if preload:
                        await redis_client.set(f"call_cache:{cid}", preload, expire=600)
                        await redis_client.delete(f"call_cache:preload:{lead_id}")
                        logger.info(f"Call cache re-keyed | lead={lead_id} → cid={cid[:12]}")
                except Exception as e:
                    logger.debug(f"Cache re-key error (non-fatal): {e}")

            if lead_id:
                try:
                    import redis as redis_sync
                    from app.core.config import settings as _s
                    _r = redis_sync.from_url(
                        getattr(_s, "REDIS_URL", "redis://localhost:6379"),
                        decode_responses=True,
                    )
                    batch_id_for_lead = _r.get(f"lead_batch:{lead_id}")
                    if batch_id_for_lead:
                        _r.setex(f"batch_call_active:{batch_id_for_lead}", 300, cid)
                        logger.info(f"Batch lock updated | batch={batch_id_for_lead} | cid={cid[:12]}")
                    else:
                        logger.debug(f"No lead_batch key for lead={lead_id} — not a batch call")
                except Exception as e:
                    logger.debug(f"Batch lock update error (non-fatal): {e}")

        elif session:
            await _update_log(session["call_log_id"], {"status": "in_progress"}, db)

        if not session:
            logger.warning(f"No session in _on_answered | cid={cid[:12]} — hanging up")
            await telnyx_service.hangup(cid)
            return

        company = await _get_company(session["company_id"], db)
        if not company:
            await telnyx_service.hangup(cid)
            return

        agent = company.agent_name or "Alex"
        if session["mode"] == "sales":
            lead  = await _get_lead(session.get("lead_id"), db)
            first = lead.name.split()[0] if lead and lead.name else ""
            greeting = (
                company.greeting_outbound
                or f"Hey{' ' + first if first else ''}! This is {agent} calling from "
                   f"{company.name}. Hope I'm not catching you at a bad time?"
            )
        else:
            greeting = (
                company.greeting_inbound
                or f"Hey there! Thanks for calling {company.name}, I'm {agent}. What can I help you with today?"
            )

        voice = get_telnyx_voice(company)
        lang  = company.voice_language or "en-US"

    # ── FIX: Pre-start Deepgram NOW, muted during greeting ───────────────────
    # Deepgram WS takes ~8-10s to connect. Starting it here during the greeting
    # TTS means it's fully ready before the caller speaks. Without this, it only
    # started when the /media WS 'start' event fired (~10s after greeting ended),
    # causing the first caller utterance to be silently dropped.
    try:
        callback = _make_transcript_callback(cid)
        started  = await deepgram_manager.start(cid, callback, company)
        if started:
            deepgram_manager.mute(cid)   # muted — AI is still speaking the greeting
            logger.info(f"Deepgram pre-started and muted during greeting | cid={cid[:12]}")
        else:
            logger.warning(f"Deepgram pre-start failed — will retry on media stream start | cid={cid[:12]}")
    except Exception as e:
        logger.warning(f"Deepgram pre-start error (non-fatal): {e} | cid={cid[:12]}")

    await session_manager.add_turn(cid, "assistant", greeting)
    ok = await telnyx_service.speak(cid, greeting, voice=voice, language=lang, client_state="greeting")
    if ok:
        logger.info(f"Greeting sent | cid={cid[:12]} | voice={voice} | lang={lang}")
    else:
        logger.error(f"speak() FAILED for greeting | cid={cid[:12]}")


async def _on_speak_ended(payload: dict):
    """
    TTS finished.
    - greeting  → start media streaming; Deepgram was pre-started so just unmute on WS start
    - ai_reply  → unmute Deepgram instantly (no reconnect)
    - farewell/transfer/voicemail → terminal, do nothing
    """
    cid          = payload["call_control_id"]
    client_state = _decode_cs(payload.get("client_state", ""))
    reason       = payload.get("reason", "")

    logger.info(f"speak.ended | state={client_state!r} | reason={reason!r} | cid={cid[:12]}")

    if cid in _hung_up or reason == "call_hangup":
        return
    if client_state in ("farewell", "transfer", "voicemail"):
        return

    if client_state == "greeting":
        stream_url = _media_ws_url()
        ok = await telnyx_service.start_streaming(cid, stream_url)
        if ok:
            logger.info(f"Media streaming started → {stream_url} | cid={cid[:12]}")
            # NOTE: Deepgram unmute happens in media_websocket when 'start' event
            # arrives, because we need the WS to be open before audio can flow.
            # deepgram_manager.unmute() is called there when already_active=True.
        else:
            logger.error(f"start_streaming FAILED | cid={cid[:12]}")
        return

    if client_state == "ai_reply":
        # Unmute instantly — no reconnect, no delay
        _responding.pop(cid, None)
        deepgram_manager.unmute(cid)
        logger.info(f"Deepgram unmuted after ai_reply | cid={cid[:12]}")
        return

    logger.debug(f"speak.ended unhandled state={client_state!r} | cid={cid[:12]}")


async def _on_streaming_started(payload: dict):
    cid = payload["call_control_id"]
    logger.info(f"Telnyx confirmed streaming active | cid={cid[:12]}")


async def _on_streaming_stopped(payload: dict):
    cid = payload["call_control_id"]
    logger.info(f"Telnyx streaming stopped | cid={cid[:12]}")
    await deepgram_manager.stop(cid)


async def _on_machine_detected(payload: dict):
    cid    = payload["call_control_id"]
    result = payload.get("result", "")

    if result in ("machine_start", "machine_end_beep", "machine_end_silence"):
        voice = "Polly.Joanna"
        lang  = "en-US"
        msg   = "Hey, we tried to reach you. Please call us back when you get a chance. Thanks!"

        session = await session_manager.get(cid)
        if session:
            async with AsyncSessionLocal() as db:
                company = await _get_company(session["company_id"], db)
                if company:
                    agent = company.agent_name or "Alex"
                    msg   = (
                        f"Hey, this is {agent} from {company.name}. "
                        f"We had something important to share with you. "
                        f"Give us a call back when you get a chance. Thanks!"
                    )
                    voice = get_telnyx_voice(company)
                    lang  = company.voice_language or "en-US"
                    await _update_log(session.get("call_log_id"), {"status": "no_answer"}, db)

        await telnyx_service.speak(cid, msg, voice=voice, language=lang, client_state="voicemail")
        await telnyx_service.stop_streaming(cid)
        await telnyx_service.hangup(cid)


async def _on_recording_saved(payload: dict):
    cid = payload["call_control_id"]
    url = payload.get("recording_urls", {}).get("mp3", "")
    session = await session_manager.get(cid)
    if session and session.get("call_log_id"):
        async with AsyncSessionLocal() as db:
            await _update_log(session["call_log_id"], {"recording_url": url}, db)


async def _on_hangup(payload: dict):
    cid = payload["call_control_id"]
    _hung_up.add(cid)
    _responding.pop(cid, None)

    await deepgram_manager.stop(cid)
    await _clear_call_cache(cid)

    # Get lead_id from session — NOT from URL payload.
    # When the receiver hangs up, Telnyx sends call.hangup without query params,
    # so payload.get("_lead_id") is None. The session always has the correct lead_id.
    # We end the session after the batch lock clear so we can read lead_id from it.
    session = await session_manager.end(cid)

    # Determine lead_id: prefer session, fall back to URL param
    session_lead_id = session.get("lead_id") if session else None
    url_lead_id     = payload.get("_lead_id")
    lead_id_for_lock = session_lead_id or url_lead_id

    if lead_id_for_lock:
        try:
            import redis as redis_sync
            from app.core.config import settings as _s
            _r = redis_sync.from_url(
                getattr(_s, "REDIS_URL", "redis://localhost:6379"),
                decode_responses=True,
            )
            batch_id_for_lead = _r.get(f"lead_batch:{lead_id_for_lock}")
            if batch_id_for_lead:
                _r.delete(f"batch_call_active:{batch_id_for_lead}")
                _r.delete(f"lead_batch:{lead_id_for_lock}")
                logger.info(f"Batch lock cleared | batch={batch_id_for_lead} | cid={cid[:12]}")
            else:
                logger.debug(f"No lead_batch key on hangup for lead={lead_id_for_lock}")
        except Exception as e:
            logger.debug(f"Batch lock clear error (non-fatal): {e}")

    if not session:
        return

    history     = session.get("history", [])
    call_log_id = session.get("call_log_id")
    lead_id     = session.get("lead_id")
    company_id  = session["company_id"]

    transcript = "\n".join([
        f"{'Agent' if m['role'] == 'assistant' else 'Caller'}: {m['content']}"
        for m in history
    ])

    analysis = {}
    if transcript:
        async with AsyncSessionLocal() as db:
            company = await _get_company(company_id, db)
        if company:
            try:
                analysis = await llm_service.analyze_call(
                    transcript, f"{company.name} — {company.description or ''}"
                )
            except Exception as e:
                logger.error(f"Analysis error: {e}")

    duration = 0
    if session.get("started_at"):
        try:
            started  = datetime.fromisoformat(session["started_at"])
            duration = int((datetime.utcnow() - started).total_seconds())
        except Exception:
            pass

    async with AsyncSessionLocal() as db:
        await _update_log(call_log_id, {
            "status":               "completed",
            "ended_at":             datetime.utcnow(),
            "duration_seconds":     duration,
            "conversation_history": history,
            "transcript":           transcript,
            "summary":              analysis.get("summary", ""),
            "sentiment":            analysis.get("sentiment", ""),
            "intent":               analysis.get("intent", ""),
            "lead_status_after":    analysis.get("lead_status", ""),
            "transferred_to_human": analysis.get("transferred_to_human", False),
        }, db)

        if lead_id:
            lead = await _get_lead(lead_id, db)
            if lead:
                new_status = analysis.get("lead_status")
                valid = ["new","contacted","interested","warm","cold","closed_won","closed_lost","do_not_call"]
                # Do not let post-call analysis downgrade a lead that explicitly
                # pressed 2 for a human callback during this same call — that
                # signal is more reliable than the AI's sentiment guess.
                if new_status and new_status in valid and lead.status != "human_callback_requested":
                    lead.status = new_status
                interest = analysis.get("interest_level")
                if interest is not None:
                    lead.interest_level = float(interest)
                key_info = analysis.get("key_info", {})
                if key_info:
                    lead.key_info = {**(lead.key_info or {}), **{k: v for k, v in key_info.items() if v}}
                lead.updated_at = datetime.utcnow()
                await db.commit()

    logger.info(f"Call ended | cid={cid[:12]} | {duration}s | status={analysis.get('lead_status')}")

    # v2: no minutes/billing system — client uses their own Telnyx account
    # and pays Telnyx directly. No deduction needed here.

    await asyncio.sleep(30)
    _hung_up.discard(cid)


@router.get("/numbers")
async def list_numbers(current_user=Depends(get_current_active_user)):
    return await telnyx_service.get_numbers()

@router.post("/calls/{cid}/hangup")
async def force_hangup(cid: str, current_user=Depends(get_current_active_user)):
    return {"success": await telnyx_service.hangup(cid)}

@router.get("/calls/{cid}/transcript")
async def live_transcript(cid: str, current_user=Depends(get_current_active_user)):
    return {"transcript": await session_manager.get_live_transcript(cid)}

@router.post("/test-call")
async def test_outbound_call(request: Request, current_user=Depends(get_current_active_user)):
    body      = await request.json()
    to_number = body.get("to_number")
    company_id= body.get("company_id")
    lead_id   = body.get("lead_id")
    call_mode = body.get("call_mode", "sales")
    if not to_number or not company_id:
        return {"error": "to_number and company_id required"}
    cid = await telnyx_service.make_outbound_call(
        to_number=to_number, company_id=company_id,
        lead_id=lead_id, call_mode=call_mode,
    )
    return {"call_control_id": cid, "status": "dialing" if cid else "failed"}


# ── Helpers ───────────────────────────────────────────────────────────────────

class _DictObj:
    def __init__(self, d: dict):
        self._d = d or {}
    def __getattr__(self, name):
        return self._d.get(name)


async def _get_company(company_id: str, db) -> Optional[Company]:
    r = await db.execute(select(Company).where(Company.id == company_id))
    return r.scalar_one_or_none()

async def _get_lead(lead_id: Optional[str], db) -> Optional[Lead]:
    if not lead_id:
        return None
    r = await db.execute(select(Lead).where(Lead.id == lead_id))
    return r.scalar_one_or_none()

async def _find_lead_by_phone(phone: str, company_id: str, db) -> Optional[Lead]:
    r = await db.execute(
        select(Lead).where(Lead.phone == phone, Lead.company_id == company_id)
    )
    return r.scalar_one_or_none()

async def _update_log(call_log_id: Optional[str], updates: dict, db):
    if not call_log_id:
        return
    r = await db.execute(select(CallLog).where(CallLog.id == call_log_id))
    log = r.scalar_one_or_none()
    if log:
        for k, v in updates.items():
            setattr(log, k, v)
        log.updated_at = datetime.utcnow()
        await db.commit()


async def preload_call_cache(cid: str, company_id: str, lead_id: Optional[str]):
    try:
        async with AsyncSessionLocal() as db:
            company = await _get_company(company_id, db)
            lead    = await _get_lead(lead_id, db) if lead_id else None

        if not company:
            logger.warning(f"preload_call_cache: company {company_id} not found")
            return

        cache = {
            "company":     _company_to_dict(company),
            "lead":        _lead_to_dict(lead) if lead else None,
            "rag_context": "",
        }
        await redis_client.set(f"call_cache:{cid}", cache, expire=600)
        logger.info(f"Call cache preloaded | cid={cid[:12] if cid else '?'}")
    except Exception as e:
        logger.warning(f"preload_call_cache error: {e}")


async def _get_call_cache(cid: str) -> Optional[Dict]:
    try:
        return await redis_client.get(f"call_cache:{cid}")
    except Exception:
        return None


async def _clear_call_cache(cid: str):
    try:
        await redis_client.delete(f"call_cache:{cid}")
    except Exception:
        pass


def _company_to_dict(company) -> Dict:
    return {
        "id":                    company.id,
        "name":                  company.name,
        "description":           company.description or "",
        "services":              company.services or "",
        "faqs":                  company.faqs or "",
        "products":              company.products or [],
        "active_product":        company.active_product,
        "agent_name":            company.agent_name or "Aria",
        "voice_language":        company.voice_language or "en-US",
        "voice_gender":          company.voice_gender or "female",
        "forward_number":        company.forward_number,
        "inbound_system_prompt": company.inbound_system_prompt,
        "outbound_sales_prompt": company.outbound_sales_prompt,
        "greeting_inbound":      company.greeting_inbound,
        "greeting_outbound":     company.greeting_outbound,
        "telnyx_phone_number":   company.telnyx_phone_number,
    }


def _lead_to_dict(lead) -> Optional[Dict]:
    if not lead:
        return None
    return {
        "id":            lead.id,
        "name":          lead.name,
        "phone":         lead.phone,
        "email":         lead.email,
        "status":        lead.status,
        "notes":         lead.notes or "",
        "key_info":      lead.key_info or {},
        "call_attempts": lead.call_attempts or 0,
        "language":      lead.language or "english",
        "timezone":      lead.timezone or "Asia/Kolkata",
    }


def _is_pricing_or_next_step_question(transcript: str) -> bool:
    """
    Detects explicit buying signals — caller asking about pricing, cost,
    how to proceed, demos, contracts, etc. This is the ONLY trigger for the
    'press 2 for human callback' DTMF offer. Deliberately keyword-based
    (not LLM) so it's fast, free, and runs on every turn without adding
    a model call to the hot path.
    """
    t = transcript.lower().strip()
    signals = [
        "price", "pricing", "cost", "how much", "rate", "rates",
        "next step", "next steps", "how do i sign up", "how do we proceed",
        "how does this work", "get started", "sign up", "demo",
        "trial", "contract", "plan", "plans", "package", "packages",
        "quote", "quotation", "payment", "subscribe", "subscription",
        "invoice", "billing",
    ]
    return any(s in t for s in signals)


def _fast_intent_check(transcript: str) -> Optional[Dict]:
    t = transcript.lower().strip()

    # Never short-circuit on questions — "why did you call me?", "what do you want?"
    # are engagement signals, not end-of-call signals. Let the LLM decide.
    if "?" in t:
        return None

    # Clear, unambiguous end-of-call phrases only.
    # Keep this list STRICT — false positives hang up on interested leads.
    end_words = [
        "bye","goodbye","good bye","bye bye","alvida","tata","ok bye","okay bye",
        "not interested","koi zaroorat nahi","mujhe nahi chahiye",
        "stop calling","dont call","don't call","remove my number",
        "do not call","hang up","band karo",
    ]
    if any(w in t for w in end_words):
        return {"wants_callback": False, "wants_to_end": True,
                "callback_time_raw": None, "callback_datetime_iso": None, "confidence": 0.95}

    callback_words = [
        "call me","call back","callback","baad mein","baad me",
        "later","tomorrow","kal","next week","agli baar",
        "morning","afternoon","evening","subah","dopahar","shaam",
        "busy right now","abhi busy","not a good time","bad time",
        "call me at","call me on","ring me",
    ]
    if any(w in t for w in callback_words):
        return None

    return {"wants_callback": False, "wants_to_end": False,
            "callback_time_raw": None, "callback_datetime_iso": None,
            "interested_now": _is_pricing_or_next_step_question(t),
            "confidence": 0.9}


def _parse_callback_datetime(iso_str: Optional[str]):
    if not iso_str:
        return None
    try:
        from datetime import time as dtime
        import pytz
        tz = pytz.timezone("Asia/Kolkata")
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        if dt.tzinfo:
            dt = dt.astimezone(tz).replace(tzinfo=None)
        window_start = dtime(9, 0)
        window_end   = dtime(18, 0)
        t = dt.time()
        if t < window_start:
            dt = dt.replace(hour=9, minute=0, second=0)
        elif t > window_end:
            from datetime import timedelta
            dt = (dt + timedelta(days=1)).replace(hour=9, minute=0, second=0)
        return dt
    except Exception as e:
        logger.debug(f"_parse_callback_datetime error: {e}")
        return None