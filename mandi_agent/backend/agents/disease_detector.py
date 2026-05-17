"""Crop disease detection agent using Gemini Vision."""

from __future__ import annotations

import base64
import json
import logging
import os
import uuid

import google.generativeai as genai

from mandi_agent.backend.api.core_schemas import DiseaseDiagnosis, Severity

logger = logging.getLogger(__name__)

MODEL = "gemini-2.0-flash"
_model: genai.GenerativeModel | None = None

CROP_DISEASE_CONTEXT = {
    "tomato": {
        "diseases": [
            ("Early Blight (Alternaria solani)", "concentric ring spots, brown lesions, lower leaves first, yellowing"),
            (
                "Late Blight (Phytophthora infestans)",
                "water-soaked lesions, white fungal growth on underside, rapid spread, dark patches",
            ),
            ("Bacterial Spot", "small water-soaked spots turning brown/black, raised lesions, leaf distortion"),
            ("Target Spot", "concentric rings, yellow halos, brown spots with target-like pattern"),
            ("Yellow Leaf Curl Virus", "upward leaf curling, yellowing, stunted growth, purple veins"),
            ("Mosaic Virus", "mottled green-yellow pattern, leaf distortion, stunted growth"),
            ("Septoria Leaf Spot", "small circular spots with gray centers and dark borders"),
            ("Spider Mites", "fine webbing, stippled yellow leaves, bronzing, leaf drop"),
            ("Leaf Mold", "pale green spots on upper leaf, olive-green mold on underside"),
        ],
        "healthy": "vibrant green leaves, no spots or discoloration, normal growth pattern, healthy stems",
    },
    "potato": {
        "diseases": [
            ("Early Blight (Alternaria solani)", "concentric ring spots, brown lesions, target-like pattern"),
            (
                "Late Blight (Phytophthora infestans)",
                "water-soaked lesions, white mold on underside, brown patches, rapid wilting",
            ),
        ],
        "healthy": "green leaves, no lesions, normal growth",
    },
    "onion": {
        "diseases": [
            ("Purple Blotch (Alternaria porri)", "purple to brown elongated lesions, yellowing leaf tips"),
            ("Downy Mildew", "pale green patches, purple-gray fuzzy growth, leaf collapse"),
        ],
        "healthy": "upright green leaves, no discoloration or lesions",
    },
    "rice": {
        "diseases": [
            ("Rice Blast (Magnaporthe oryzae)", "diamond-shaped lesions with gray centers, brown margins, neck rot"),
            ("Brown Spot (Cochliobolus)", "oval brown spots with gray centers, leaf tip dieback"),
            ("Bacterial Leaf Blight", "water-soaked stripes, yellow to white leaves, leaf rolling"),
        ],
        "healthy": "green upright leaves, no spots, normal panicle development",
    },
    "wheat": {
        "diseases": [
            ("Rust (Puccinia triticina)", "orange-brown pustules on leaves and stems, powdery spores"),
            ("Powdery Mildew (Blumeria)", "white powdery coating on leaves, yellowing, stunted growth"),
            ("Septoria Leaf Blotch", "brown rectangular spots with yellow halos, gray centers"),
        ],
        "healthy": "green leaves, no pustules or powdery coating, normal tillering",
    },
    "chilli": {
        "diseases": [
            ("Anthracnose (Colletotrichum)", "sunken dark spots on fruits, circular lesions with pink spores"),
            ("Leaf Curl Virus", "upward curling leaves, yellowing, stunted growth, fruit drop"),
            ("Powdery Mildew (Leveillula)", "white powdery coating on underside, yellowing, leaf drop"),
            ("Phytophthora Blight", "water-soaked lesions, stem rot, sudden wilt, fruit rot"),
        ],
        "healthy": "green leaves, no curling or spots, healthy fruit set",
    },
    "corn": {
        "diseases": [
            ("Gray Leaf Spot (Cercospora)", "rectangular gray-tan lesions, parallel to leaf veins"),
            ("Common Rust (Puccinia sorghi)", "brown to cinnamon pustules on both leaf surfaces"),
            ("Northern Leaf Blight (Exserohilum)", "large cigar-shaped gray-green lesions, tan centers"),
        ],
        "healthy": "green leaves, no lesions, normal ear development",
    },
    "apple": {
        "diseases": [
            ("Apple Scab (Venturia)", "olive-green to black spots on leaves, corky lesions on fruit"),
            ("Black Rot (Botryosphaeria)", "purple spots on leaves, bull's eye rot on fruit"),
            ("Cedar Apple Rust (Gymnosporangium)", "orange-yellow spots on leaves, tube-like projections"),
        ],
        "healthy": "green leaves, no spots, normal fruit development",
    },
    "grape": {
        "diseases": [
            ("Black Rot (Guignardia)", "brown circular spots on leaves, black shriveled berries"),
            ("Esca (Black Measles)", "tiger-stripe pattern on leaves, brown streaks in wood"),
            ("Leaf Blight (Isariopsis)", "large irregular brown spots, yellowing around spots"),
        ],
        "healthy": "green leaves, no spots, normal cluster development",
    },
}


def _get_model() -> genai.GenerativeModel:
    global _model
    if _model is None:
        api_key = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
        if not api_key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not set")
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel(MODEL)
    return _model


def _build_prompt(crop: str) -> str:
    crop_lower = crop.lower()
    context = CROP_DISEASE_CONTEXT.get(crop_lower)

    disease_list = ""
    if context:
        disease_list = "\nKnown diseases for " + crop + ":\n"
        for disease, symptoms in context["diseases"]:
            disease_list += f"- {disease}: {symptoms}\n"
        disease_list += f"- Healthy: {context['healthy']}\n"

    prompt = (
        "You are an expert agricultural pathologist with 30 years of experience diagnosing crop diseases from images.\n\n"
        f"Analyze the provided {crop} crop image carefully. Focus on:\n"
        "1. Leaf patterns: spots, lesions, discoloration, curling, wilting\n"
        "2. Distribution: uniform, patchy, on specific leaf parts\n"
        "3. Color changes: yellowing, browning, purple spots, white patches\n"
        "4. Texture: powdery, water-soaked, dry, raised lesions\n"
    )

    if disease_list:
        prompt += "\n" + disease_list + "\n"

    prompt += (
        "Return ONLY valid JSON with these exact keys:\n"
        "- disease_name: Specific disease name from the list above, or 'Healthy', or 'Unknown' if uncertain\n"
        "- confidence: Float 0.0-1.0 representing certainty (0.9+ for healthy, 0.7+ for clear disease, <0.5 if unsure)\n"
        "- severity: One of 'low', 'medium', 'high', 'critical'\n"
        "- symptoms_observed: List of 2-4 visible symptoms you can see in the image\n"
        "- preventive_actions: List of 2-3 prevention measures specific to this crop and disease\n"
        "- treatment_actions: List of 2-3 treatment options with specific fungicide/pesticide names\n"
        "- escalation_required: Boolean, true if severity is critical or confidence < 0.5\n\n"
        "Rules:\n"
        "- If the plant looks healthy, set disease_name='Healthy' and confidence > 0.9\n"
        "- If unsure between diseases, pick most likely and set confidence < 0.6\n"
        "- Include specific product names in treatments (e.g., Mancozeb, Copper oxychloride)\n"
        "- Be specific to " + crop + " - do not give generic advice\n"
    )

    return prompt


async def detect_crop_disease(image_base64: str, crop: str) -> DiseaseDiagnosis:
    """Analyze crop image for disease symptoms using Gemini Vision."""
    prompt = _build_prompt(crop)

    try:
        image_bytes = base64.b64decode(image_base64)
        model = _get_model()
        response = await model.generate_content_async(
            [
                {"mime_type": "image/jpeg", "data": image_bytes},
                prompt,
            ]
        )
        raw = (response.text or "").strip()
        if "```json" in raw:
            raw = raw.split("```json", 1)[1].split("```", 1)[0].strip()
        elif "```" in raw:
            raw = raw.split("```", 1)[1].split("```", 1)[0].strip()

        data = json.loads(raw)
        disease_name = str(data.get("disease_name", "unknown"))
        confidence = float(data.get("confidence", 0.55))
        severity_str = str(data.get("severity", "medium")).lower()

        if disease_name.lower() in ("healthy", "no disease", "no disease detected"):
            severity_str = "low"
            confidence = max(confidence, 0.9)

        severity_map = {
            "low": Severity.LOW,
            "medium": Severity.MEDIUM,
            "high": Severity.HIGH,
            "critical": Severity.CRITICAL,
        }
        severity = severity_map.get(severity_str, Severity.MEDIUM)

        return DiseaseDiagnosis(
            diagnosis_id=f"diag-{uuid.uuid4().hex[:12]}",
            crop=crop,
            disease_name=disease_name,
            confidence=confidence,
            severity=severity,
            symptoms_observed=list(data.get("symptoms_observed", [])),
            preventive_actions=list(data.get("preventive_actions", [])),
            treatment_actions=list(data.get("treatment_actions", [])),
            escalation_required=bool(data.get("escalation_required", False)) or confidence < 0.5,
        )
    except Exception as exc:
        logger.warning("Disease detection fallback: %s", str(exc)[:160])
        return _fallback_diagnosis(crop)


def _fallback_diagnosis(crop: str) -> DiseaseDiagnosis:
    CROP_COMMON_DISEASES = {
        "tomato": {
            "disease_name": "Early Blight (suspected)",
            "symptoms": ["brown lesions on lower leaves", "concentric rings on spots"],
        },
        "potato": {
            "disease_name": "Late Blight (suspected)",
            "symptoms": ["water-soaked lesions", "white mould on leaf underside"],
        },
        "onion": {
            "disease_name": "Purple Blotch (suspected)",
            "symptoms": ["purple lesions on leaves", "yellowing leaf tips"],
        },
        "rice": {
            "disease_name": "Rice Blast (suspected)",
            "symptoms": ["diamond-shaped lesions on leaves", "neck rot"],
        },
        "wheat": {
            "disease_name": "Rust (suspected)",
            "symptoms": ["orange-brown pustules on leaves", "reduced vigour"],
        },
        "chilli": {
            "disease_name": "Anthracnose (suspected)",
            "symptoms": ["sunken spots on fruits", "circular lesions"],
        },
    }
    crop_info = CROP_COMMON_DISEASES.get(
        crop.lower(),
        {
            "disease_name": "Leaf disease (suspected)",
            "symptoms": ["leaf discoloration", "spotting"],
        },
    )
    return DiseaseDiagnosis(
        diagnosis_id=f"diag-{uuid.uuid4().hex[:12]}",
        crop=crop,
        disease_name=crop_info["disease_name"],
        confidence=0.45,
        severity=Severity.MEDIUM,
        symptoms_observed=crop_info["symptoms"],
        preventive_actions=["avoid overhead irrigation", "improve airflow", "remove infected plant debris"],
        treatment_actions=["consult KVK or agricultural officer", "apply recommended fungicide as per label"],
        escalation_required=True,
    )
