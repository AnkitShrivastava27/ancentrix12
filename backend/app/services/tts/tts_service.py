"""
TTS Service
- Primary: Telnyx native speak command (Polly.Aditi, Indian accent, free)
- Fallback: gTTS (Google TTS, free, works without Telnyx for testing)

During a live call, Telnyx TTS is used directly via the speak/gather commands.
gTTS is used only for generating audio files for testing or non-call contexts.
"""
import logging
import os
import asyncio
from typing import Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


class TTSService:
    """
    During calls: use telnyx_service.speak() / telnyx_service.gather() directly.
    This class is for standalone audio generation (testing, pre-recorded messages).
    """

    async def generate_audio(self, text: str, output_path: str, language: str = "en") -> bool:
        """Generate audio file from text. Returns True if successful."""
        provider = settings.TTS_PROVIDER

        if provider == "gtts":
            return await self._gtts(text, output_path, language)
        else:
            # For calls, TTS is handled by Telnyx directly — this is just a fallback
            return await self._gtts(text, output_path, language)

    async def _gtts(self, text: str, output_path: str, language: str = "en") -> bool:
        try:
            from gtts import gTTS
            lang_map = {
                "hinglish": "hi",
                "hindi": "hi",
                "english": "en",
                "en-IN": "en",
                "hi-IN": "hi",
            }
            tld_map = {
                "hinglish": "co.in",
                "hindi": "co.in",
                "english": "co.in",
                "en-IN": "co.in",
                "hi-IN": "co.in",
            }
            lang_code = lang_map.get(language, "en")
            tld = tld_map.get(language, "co.in")

            def _generate():
                tts = gTTS(text=text, lang=lang_code, tld=tld, slow=False)
                tts.save(output_path)

            await asyncio.get_event_loop().run_in_executor(None, _generate)
            logger.info(f"gTTS generated: {output_path}")
            return True
        except Exception as e:
            logger.error(f"gTTS error: {e}")
            return False

    def get_telnyx_voice(self, language: str = "en-IN", gender: str = "female") -> str:
        """Return the correct Polly voice name for Telnyx speak commands."""
        from app.services.telephony.telnyx_service import VOICE_MAP
        return VOICE_MAP.get((language, gender.lower()), "Polly.Aditi")


tts_service = TTSService()
