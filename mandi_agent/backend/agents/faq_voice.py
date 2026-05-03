"""Voice-based FAQ retrieval and multilingual TTS generation."""

from __future__ import annotations

import re
import uuid

from mandi_agent.backend.api.core_schemas import FAQVoiceItem
from mandi_agent.backend.agents.voice_interface import text_to_speech, translate_text


FAQ_BANK_EN: list[dict[str, str]] = [
    {
        "question": "When should I harvest tomato?",
        "answer": "Harvest when fruits are mature and avoid long holding in high heat. Check mandi trend before dispatch.",
    },
    {
        "question": "How can I prevent crop disease spread?",
        "answer": "Use clean tools, remove infected leaves, avoid overhead irrigation and follow recommended fungicide schedule.",
    },
    {
        "question": "What to do when heavy rain is forecast?",
        "answer": "Strengthen field drainage, protect harvested produce under cover, and delay spray operations if rain is imminent.",
    },
    {
        "question": "How should I store onions after harvest?",
        "answer": "Store in well-ventilated, cool, dry place with 35-40% humidity. Stack carefully to prevent bruising and damage.",
    },
    {
        "question": "When is the best time to apply fertilizer?",
        "answer": "Apply NPK based on soil test. Split fertilizer application: N at growth, P-K at sowing. Avoid during heavy rain.",
    },
    {
        "question": "What is the ideal irrigation schedule for chilli?",
        "answer": "Irrigate every 3-4 weeks during dry season, reduce during rainy season. Avoid waterlogging which causes root rot.",
    },
    {
        "question": "How to identify early blight in potatoes?",
        "answer": "Look for brown spots on lower leaves with concentric rings. Remove affected leaves and apply fungicide spray.",
    },
    {
        "question": "What is minimum land size for agricultural loan?",
        "answer": "Most schemes require 0.4 hectare minimum. Landless farmers can apply under special schemes. Check with local bank.",
    },
    {
        "question": "How do I check mandi prices before selling?",
        "answer": "Call mandi office, check Agmarknet website, or use mobile app. Prices vary by grade, quality, and arrival volume.",
    },
    {
        "question": "When should cottonseed be sown?",
        "answer": "Sow between June-July. Need 30-48 hours water for germination. Plant with spacing 90cm x 60cm for optimal yield.",
    },
    {
        "question": "How to manage fall armyworm in maize?",
        "answer": "Scout fields regularly at V3-V6 stage. Spray recommended insecticide early morning or evening. Avoid broad spectrum use.",
    },
    {
        "question": "What is proper spacing for sugarcane planting?",
        "answer": "Plant at 90cm row spacing with 15-20 cm plant spacing. Use disease-free seed of 35-40 tonnes per hectare.",
    },
    {
        "question": "How to increase wheat productivity in rainfed areas?",
        "answer": "Use drought-resistant varieties, apply mulch for moisture retention, and practice water harvesting during monsoon.",
    },
    {
        "question": "When should I apply weedicide in rice fields?",
        "answer": "Apply at 20-25 DAS (days after sowing) when weeds are at 2-3 leaf stage for best control.",
    },
    {
        "question": "What are PM-KISAN scheme payment dates?",
        "answer": "Three installments yearly: April, August, December. Check status on pmkisan.gov.in with Aadhaar or bank account.",
    },
]


STOP_WORDS = {
    "what", "when", "how", "is", "the", "a", "an", "to", "for", "in",
    "of", "do", "should", "i", "my", "me", "can", "are", "this", "that",
    "it", "be", "with", "on", "at", "from",
}


def _tokenize(text: str) -> set[str]:
    tokens = set(re.findall(r"[a-zA-Z]+", text.lower()))
    return tokens - STOP_WORDS


async def get_voice_faq(query: str, language: str = "hi") -> FAQVoiceItem:
    """Resolve query to best FAQ and prepare localized audio answer."""
    q_tokens = _tokenize(query)
    if not q_tokens:
        q_tokens = set(re.findall(r"[a-zA-Z]+", query.lower()))

    best = FAQ_BANK_EN[0]
    best_score = -1.0
    for faq in FAQ_BANK_EN:
        faq_tokens = _tokenize(faq["question"]) | _tokenize(faq["answer"])
        overlap = q_tokens.intersection(faq_tokens)
        # Weight question-token matches higher than answer-token matches
        q_overlap = q_tokens.intersection(_tokenize(faq["question"]))
        score = len(q_overlap) * 2.0 + len(overlap - q_overlap)
        if score > best_score:
            best_score = score
            best = faq

    localized_q = best["question"]
    localized_a = best["answer"]
    if language != "en":
        localized_q = await translate_text(best["question"], "en", language)
        localized_a = await translate_text(best["answer"], "en", language)

    audio_b64 = await text_to_speech(localized_a, language)
    audio_url = f"data:audio/wav;base64,{audio_b64}" if audio_b64 else None
    confidence = min(0.97, 0.50 + best_score * 0.08) if best_score > 0 else 0.40

    return FAQVoiceItem(
        faq_id=f"faq-{uuid.uuid4().hex[:10]}",
        language=language,
        question=localized_q,
        answer=localized_a,
        audio_url=audio_url,
        confidence=confidence,
    )
