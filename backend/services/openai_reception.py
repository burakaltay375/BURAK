"""OpenAI-backed hotel reception assistant service."""

import logging
import os
import re
from typing import Literal, Optional, Sequence, TypedDict

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    AuthenticationError,
    RateLimitError,
)

logger = logging.getLogger("hotel-ops.reception-ai")

DEFAULT_SYSTEM_PROMPT = """
Sen doğal, insansı, profesyonel, empatik ve her koşulda kibar konuşan bir otel
resepsiyon yapay zekasısın. Misafirle tartışma, onu suçlama, küçümseme veya
sinirli bir tona karşı sinirli yanıt verme.

TONUNU MESAJIN DUYGUSUNA GÖRE UYARLA:
- Normal durumda sıcak ve profesyonel ol.
- Misafir üzgünse anlayış göster ve yardım etmeye odaklan.
- Misafir sinirliyse savunmaya geçmeden özür dile, sakinleştir ve çözüm sun.
- Misafir teşekkür ederse sıcak ve kısa karşılık ver.
- Misafir mutluysa daha samimi ve pozitif ol.
- Acil durumda ciddi, kısa, doğrudan ve net ol; gereksiz nezaket cümleleri kurma.
- 😊 🙂 🙏 🏨 ❤️ emojilerinden uygun olanı yalnızca zaman zaman ve en fazla bir
  tane kullan. Her mesajda emoji kullanma.
- Yakın geçmişteki yanıtların açılışlarını birebir tekrarlama. Bağlama uygun,
  doğal cümleler kur; kalıp metin hissi verme.

Misafirleri sıcak bir dille karşıla, sorularını açık ve kısa şekilde yanıtla.
Otel hizmetleri, giriş/çıkış işlemleri ve genel konaklama konularında yardımcı ol.
Emin olmadığın otel bilgilerini uydurma; gerektiğinde resepsiyon görevlisine
yönlendir. Hassas kişisel veya ödeme bilgilerini isteme. Kullanıcının dilinde
yanıt ver.

HER MESAJ İÇİN ZORUNLU KARAR AKIŞI:
1. Yanıt vermeden önce mesajın niyetini içinden belirle:
   - SIPARIS: Misafir ürün, yiyecek veya içecek sipariş ediyor.
   - HIZMET_TALEBI: Misafir somut bir otel hizmeti istiyor.
   - BILGI: Misafir fiyat, saat, olanak veya hizmet hakkında soru soruyor.
   - SIKAYET: Misafir arıza, memnuniyetsizlik veya sorun bildiriyor.
   - GENEL: Selamlama ya da diğer konuşmalar.
2. SIPARIS veya HIZMET_TALEBI için istenen ürün/hizmet açıkça belirtilmiş mi
   kontrol et. Belirtilmemişse işlem yapma, fiyat/menü gösterme ve tek bir kısa
   açıklama sorusu sor.
3. SIKAYET mesajlarında sorunu anladığını belirt; yalnızca çözüm için gereken
   eksik bilgiyi sor veya ilgili ekibe yönlendir.
4. BILGI mesajlarında sadece sorulan hizmet veya ürünle ilgili bilgi ver.

KESİN KURALLAR:
- Asla alakasız fiyat listeleri veya menüler dökme.
- Sadece misafirin mevcut mesajında sorduğu konuya odaklan.
- Misafirin isteği belirsizse tahmin etme; açıklama iste.
- Misafir açıkça "tüm menüyü/fiyat listesini göster" demedikçe toplu liste verme.
- Önceki konuşmadaki farklı bir hizmeti, mevcut mesajla ilgisi yoksa yanıta taşıma.
""".strip()

Intent = Literal["SIPARIS", "HIZMET_TALEBI", "BILGI", "SIKAYET", "GENEL"]

COMPLAINT_WORDS = {
    "çalışmıyor", "calismiyor", "bozuk", "şikayet", "sikayet", "kırık",
    "kirik", "arıza", "ariza", "memnun değil", "memnun degil", "sorun",
}
ORDER_WORDS = {
    "sipariş", "siparis", "yemek", "içecek", "icecek", "kahve", "çay",
    "cay", "su", "tost", "sandviç", "sandvic", "burger", "kahvaltı",
    "kahvalti", "espresso",
}
SERVICE_WORDS = {
    "oda servisi", "room service", "hizmet", "servis", "havlu", "temizlik",
    "vale", "transfer", "spa", "çamaşır", "camasir", "ütü", "utu",
}
INFO_PHRASES = {
    "ne kadar", "fiyat", "ücret", "ucret", "kaçta", "kacta", "nedir",
    "var mı", "var mi", "açık mı", "acik mi", "bilgi",
}
ANGER_WORDS = {
    "sinirliyim", "kızgınım", "kizginim", "rezalet", "berbat", "saçmalık",
    "sacmalik", "bıktım", "biktim", "kabul edilemez", "şikayetçiyim",
}
SAD_WORDS = {
    "üzgünüm", "uzgunum", "moralim bozuk", "hayal kırıklığı", "hayal kirikligi",
    "kötü hissediyorum", "kotu hissediyorum", "mutsuzum",
}
THANKS_WORDS = {"teşekkür", "tesekkur", "sağ ol", "sag ol", "thanks", "thank you"}
POSITIVE_WORDS = {
    "harika", "mükemmel", "mukemmel", "çok güzel", "cok guzel", "mutluyum",
    "bayıldım", "bayildim", "süper", "super", "memnun kaldım", "memnun kaldim",
}
EMERGENCY_WORDS = {
    "acil", "yangın", "yangin", "duman", "ambulans", "bayıldı", "bayildi",
    "nefes alamıyor", "nefes alamiyor", "tehlike", "yaralandı", "yaralandi",
    "polis", "imdat",
}

VAGUE_REQUEST_PATTERNS = (
    r"^(?:bir\s+)?sipari[şs](?:i)?\s+(?:vermek|etmek)\s+istiyorum[.!?]*$",
    r"^(?:bir\s+)?(?:hizmet|servis)\s+(?:almak\s+|istemek\s+)?istiyorum[.!?]*$",
    r"^(?:oda servisi|room service)(?:nden)?\s+(?:sipari[şs](?:i)?\s+)?"
    r"(?:vermek\s+|etmek\s+)?istiyorum[.!?]*$",
    r"^(?:oda servisi|room service)\s+lütfen[.!?]*$",
)


class ChatHistoryMessage(TypedDict):
    role: Literal["user", "assistant"]
    content: str


class ReceptionAIError(Exception):
    """Safe, user-facing error raised by the reception AI service."""

    def __init__(self, user_message: str, status_code: int = 503) -> None:
        super().__init__(user_message)
        self.user_message = user_message
        self.status_code = status_code


Tone = Literal["normal", "sad", "angry", "thanks", "positive", "emergency"]


def recognize_tone(message: str) -> Tone:
    normalized = " ".join(message.casefold().split())
    if any(word in normalized for word in EMERGENCY_WORDS):
        return "emergency"
    if any(word in normalized for word in ANGER_WORDS):
        return "angry"
    if any(word in normalized for word in SAD_WORDS):
        return "sad"
    if any(word in normalized for word in THANKS_WORDS):
        return "thanks"
    if any(word in normalized for word in POSITIVE_WORDS):
        return "positive"
    return "normal"


def adapt_reception_tone(
    message: str,
    reply: str,
    history: Sequence[ChatHistoryMessage] = (),
) -> str:
    """Adjust delivery without changing hotel facts or operational meaning."""

    clean_reply = reply.strip()
    if not clean_reply:
        return clean_reply
    tone = recognize_tone(message)
    previous = next(
        (item["content"].casefold() for item in reversed(history) if item["role"] == "assistant"),
        "",
    )
    if tone == "emergency":
        return re.sub(r"[😊🙂🙏🏨❤️]", "", clean_reply).strip()
    gratitude_only = bool(re.fullmatch(
        r"(?:çok\s+)?(?:teşekkür(?:ler| ederim)?|tesekkur(?:ler| ederim)?|"
        r"sağ ol(?:un)?|sag ol(?:un)?|thanks|thank you)[.!🙏😊🙂\s]*",
        message.casefold().strip(),
    ))
    if tone == "thanks" and gratitude_only:
        options = [
            "Rica ederim 😊 Size yardımcı olabildiysem ne mutlu.",
            "Ne demek, her zaman yardımcı olmaktan memnuniyet duyarım.",
            "Rica ederim. Başka bir ihtiyacınız olursa buradayım 🙂",
        ]
        return next((text for text in options if text.casefold() not in previous), options[0])
    if tone == "angry":
        if any(word in clean_reply.casefold() for word in ("sizi anlıyorum", "üzgünüm", "can sıkıcı", "rahatsız")):
            return clean_reply
        openings = [
            "Yaşadığınız durum için gerçekten üzgünüm. Sizi anlıyorum, hemen çözüm bulmaya çalışalım.",
            "Bunun ne kadar can sıkıcı olduğunu anlıyorum. Size sakin ve hızlı şekilde yardımcı olayım.",
            "Haklı olarak rahatsız olduğunuzu anlıyorum. Konuyu çözmek için hemen ilgilenelim.",
        ]
        opening = next((text for text in openings if text.casefold() not in previous), openings[1])
        return f"{opening} {clean_reply}"
    if tone == "sad":
        if any(word in clean_reply.casefold() for word in ("sizi anlıyorum", "üzgünüm", "yardımcı olmak için")):
            return clean_reply
        openings = [
            "Sizi anlıyorum, hemen yardımcı olayım.",
            "Bunu yaşadığınız için üzgünüm. Birlikte çözüm bulalım.",
            "Nasıl hissettiğinizi anlıyorum. Size yardımcı olmak için buradayım.",
        ]
        opening = next((text for text in openings if text.casefold() not in previous), openings[1])
        return f"{opening} {clean_reply}"
    if tone == "positive" and not any(word in clean_reply.casefold() for word in ("harika", "sevindim", "mutlu")):
        return f"Bunu duymak çok güzel 🙂 {clean_reply}"
    return clean_reply


def recognize_intent(message: str) -> Intent:
    """Classify the current message before asking the language model."""

    normalized = " ".join(message.casefold().split())
    if any(word in normalized for word in COMPLAINT_WORDS):
        return "SIKAYET"
    if any(phrase in normalized for phrase in INFO_PHRASES):
        return "BILGI"
    if any(word in normalized for word in ORDER_WORDS):
        return "SIPARIS"
    if any(word in normalized for word in SERVICE_WORDS):
        return "HIZMET_TALEBI"
    return "GENEL"


def needs_request_details(message: str, intent: Intent) -> bool:
    """Detect generic orders/service requests that contain no requested item."""

    if intent not in {"SIPARIS", "HIZMET_TALEBI"}:
        return False
    normalized = " ".join(message.casefold().split())
    return any(re.fullmatch(pattern, normalized) for pattern in VAGUE_REQUEST_PATTERNS)


def missing_details_reply(room_number: Optional[str]) -> str:
    destination = (
        f"{room_number} numaralı odaya"
        if room_number and room_number.strip()
        else "odanıza"
    )
    return (
        f"Tabii ki {destination} yazdırabiliriz. Tam olarak hangi hizmetimizi "
        "veya ürünümüzü istemiştiniz?"
    )


def _messages(
    message: str,
    history: Sequence[ChatHistoryMessage],
    system_prompt: str,
    intent: Intent,
    room_number: Optional[str],
) -> list[dict[str, str]]:
    cleaned_history = [
        {"role": item["role"], "content": item["content"].strip()}
        for item in history[-20:]
        if item["content"].strip()
    ]
    context = (
        f"Sistem niyet analizi: {intent}. "
        f"Sistem duygu/ton analizi: {recognize_tone(message)}. "
        f"Kayıtlı oda: {room_number or 'bilinmiyor'}. "
        "Bu teknik etiketleri kullanıcıya gösterme."
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "system", "content": context},
        *cleaned_history,
        {"role": "user", "content": message.strip()},
    ]


async def ask_reception_ai(
    message: str,
    history: Sequence[ChatHistoryMessage] = (),
    *,
    system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    room_number: Optional[str] = None,
) -> str:
    """Return a reception-assistant reply while preserving recent chat context."""

    intent = recognize_intent(message)
    if needs_request_details(message, intent):
        return adapt_reception_tone(message, missing_details_reply(room_number), history)

    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    if not api_key:
        raise ReceptionAIError(
            "Resepsiyon yapay zeka servisi henüz yapılandırılmamış.",
            status_code=503,
        )

    client = AsyncOpenAI(api_key=api_key, timeout=30.0, max_retries=2)
    try:
        completion = await client.chat.completions.create(
            model=model,
            messages=_messages(
                message,
                history,
                system_prompt,
                intent,
                room_number,
            ),
            temperature=0.5,
            max_tokens=500,
        )
        reply = completion.choices[0].message.content
        if not reply or not reply.strip():
            raise ReceptionAIError(
                "Resepsiyon asistanı şu anda yanıt üretemedi. Lütfen tekrar deneyin."
            )
        return adapt_reception_tone(message, reply, history)
    except ReceptionAIError:
        raise
    except AuthenticationError as exc:
        logger.error("OpenAI authentication failed: %s", exc)
        raise ReceptionAIError(
            "Resepsiyon yapay zeka servisi yapılandırma hatası nedeniyle kullanılamıyor."
        ) from exc
    except RateLimitError as exc:
        logger.warning("OpenAI rate limit reached: %s", exc)
        raise ReceptionAIError(
            "Resepsiyon asistanı şu anda yoğun. Lütfen kısa bir süre sonra tekrar deneyin.",
            status_code=429,
        ) from exc
    except (APIConnectionError, APITimeoutError) as exc:
        logger.warning("OpenAI connection failed: %s", exc)
        raise ReceptionAIError(
            "Resepsiyon asistanına şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin."
        ) from exc
    except APIStatusError as exc:
        logger.error("OpenAI API error (%s): %s", exc.status_code, exc)
        raise ReceptionAIError(
            "Resepsiyon asistanında geçici bir sorun oluştu. Lütfen tekrar deneyin."
        ) from exc
    except Exception as exc:
        logger.exception("Unexpected reception AI error")
        raise ReceptionAIError(
            "Beklenmeyen bir hata oluştu. Lütfen resepsiyonla iletişime geçin."
        ) from exc
