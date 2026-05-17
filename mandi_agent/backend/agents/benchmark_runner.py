"""
Benchmark runner for disease detection.

Runs multiple prompt versions against sampled dataset images,
collects predictions, and saves results for analysis.
"""

import json
import logging
import time
from datetime import datetime
from pathlib import Path

import google.generativeai as genai

logger = logging.getLogger(__name__)

GEMINI_MODELS = {
    "flash_2_0": "gemini-2.0-flash",
    "flash_2_5": "gemini-2.5-flash-preview-04-17",
    "pro_2_5": "gemini-2.5-pro-preview-05-06",
}

PROMPT_VERSIONS = {
    "v0_baseline": (
        "You are an agricultural pathologist. Analyze this crop image and return JSON with keys: "
        "disease_name, confidence (0-1), severity(low|medium|high|critical), symptoms_observed(list), "
        "preventive_actions(list), treatment_actions(list), escalation_required(boolean). "
        "Crop is {crop}. If uncertain, set disease_name='unknown'."
    ),
    "v1_expert_context": (
        "You are an expert agricultural pathologist with 30 years of experience diagnosing crop diseases from images.\n\n"
        "Analyze the provided {crop} crop image carefully. Focus on:\n"
        "1. Leaf patterns: spots, lesions, discoloration, curling, wilting\n"
        "2. Distribution: uniform, patchy, on specific leaf parts\n"
        "3. Color changes: yellowing, browning, purple spots, white patches\n"
        "4. Texture: powdery, water-soaked, dry, raised lesions\n\n"
        "Return ONLY valid JSON with these exact keys:\n"
        "- disease_name: Specific disease name (e.g., 'Early Blight', 'Late Blight', 'Healthy')\n"
        "- confidence: Float 0.0-1.0 representing certainty\n"
        "- severity: One of 'low', 'medium', 'high', 'critical'\n"
        "- symptoms_observed: List of 2-4 visible symptoms\n"
        "- preventive_actions: List of 2-3 prevention measures\n"
        "- treatment_actions: List of 2-3 treatment options with specific products\n"
        "- escalation_required: Boolean, true if critical or uncertain\n\n"
        "Rules:\n"
        "- If the plant looks healthy, set disease_name='Healthy' and confidence > 0.9\n"
        "- If unsure between diseases, pick most likely and set confidence < 0.6\n"
        "- Include specific fungicide/pesticide names in treatments\n"
        "- Crop: {crop}"
    ),
    "v2_multi_shot": (
        "You are an expert agricultural pathologist. Analyze this {crop} image and diagnose any disease.\n\n"
        "Example diagnoses for reference:\n"
        "- Early Blight: Brown spots with concentric rings, starts on lower leaves, confidence 0.85\n"
        "- Late Blight: Water-soaked lesions, white fungal growth on underside, rapid spread, confidence 0.90\n"
        "- Bacterial Spot: Small water-soaked spots that turn brown/black, raised lesions, confidence 0.80\n"
        "- Healthy: Green leaves, no spots or discoloration, normal growth pattern, confidence 0.95\n\n"
        "Return ONLY valid JSON:\n"
        "disease_name, confidence (0-1), severity(low|medium|high|critical), symptoms_observed(list), "
        "preventive_actions(list), treatment_actions(list), escalation_required(boolean).\n"
        "Crop: {crop}. If very uncertain, set disease_name='unknown', confidence < 0.4."
    ),
    "v3_chain_of_thought": (
        "Analyze this {crop} crop image step by step as an expert agricultural pathologist.\n\n"
        "Analysis steps:\n"
        "1. FIRST: Describe exactly what you see - leaf color, spot patterns, lesion shapes, affected areas\n"
        "2. SECOND: Compare observed symptoms with known {crop} diseases\n"
        "3. THIRD: Rule out unlikely diseases based on visual evidence\n"
        "4. FOURTH: State your diagnosis with confidence level\n\n"
        "Known {crop} diseases to consider:\n"
        "- Early Blight: concentric ring spots, lower leaves first\n"
        "- Late Blight: water-soaked lesions, white mold, rapid spread\n"
        "- Bacterial Spot: small dark spots, raised lesions\n"
        "- Septoria Leaf Spot: small circular spots with gray centers\n"
        "- Spider Mites: fine webbing, stippled yellow leaves\n"
        "- Healthy: no visible disease symptoms\n\n"
        "Return ONLY valid JSON after your analysis:\n"
        "disease_name, confidence (0-1), severity(low|medium|high|critical), symptoms_observed(list), "
        "preventive_actions(list), treatment_actions(list), escalation_required(boolean).\n"
        "Be precise. If truly uncertain, set disease_name='unknown'."
    ),
}


def _get_gemini_model(model_key: str) -> genai.GenerativeModel:
    model_name = GEMINI_MODELS.get(model_key, GEMINI_MODELS["flash_2_0"])
    api_key = __import__("os").getenv("GEMINI_API_KEY", __import__("os").getenv("GOOGLE_API_KEY", ""))
    if not api_key:
        raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY not set")
    genai.configure(api_key=api_key)
    return genai.GenerativeModel(model_name)


async def run_single_prediction(
    image_path: str,
    crop: str,
    prompt_version: str = "v0_baseline",
    model_key: str = "flash_2_0",
) -> dict:
    img = Path(image_path)
    if not img.exists():
        return {"error": f"Image not found: {image_path}"}

    image_bytes = img.read_bytes()
    prompt = PROMPT_VERSIONS.get(prompt_version, PROMPT_VERSIONS["v0_baseline"]).format(crop=crop)

    try:
        model = _get_gemini_model(model_key)
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
        return {
            "predicted_disease": data.get("disease_name", "unknown"),
            "confidence": data.get("confidence", 0.5),
            "severity": data.get("severity", "medium"),
            "symptoms": data.get("symptoms_observed", []),
            "raw_response": raw[:500],
        }
    except Exception as e:
        return {"error": str(e)[:200], "raw_response": raw[:200] if "raw" in locals() else ""}


async def run_benchmark(
    manifest_path: str = "data/benchmark_sample/manifest.json",
    prompt_versions: list[str] = None,
    model_key: str = "flash_2_0",
    output_dir: str = "data/benchmark_results",
    delay_between_requests: float = 0.5,
) -> dict:
    manifest = json.loads(Path(manifest_path).read_text())
    prompt_versions = prompt_versions or list(PROMPT_VERSIONS.keys())
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    results = {
        "run_timestamp": datetime.now().isoformat(),
        "model": model_key,
        "prompt_versions": prompt_versions,
        "total_images": len(manifest),
        "predictions": [],
    }

    print(f"\nBenchmark: {len(manifest)} images × {len(prompt_versions)} prompt versions")
    print(f"Model: {GEMINI_MODELS.get(model_key, model_key)}")
    print("=" * 60)

    for i, sample in enumerate(manifest):
        for pv in prompt_versions:
            start = time.time()
            pred = await run_single_prediction(
                image_path=sample["image_path"],
                crop=sample["crop"],
                prompt_version=pv,
                model_key=model_key,
            )
            elapsed = time.time() - start

            result = {
                "index": i,
                "crop": sample["crop"],
                "ground_truth": sample["disease"],
                "ground_truth_full": sample["ground_truth"],
                "image_path": sample["image_path"],
                "prompt_version": pv,
                "prediction": pred,
                "latency_ms": round(elapsed * 1000, 0),
            }
            results["predictions"].append(result)

            status = "OK" if "error" not in pred else f"ERROR: {pred['error'][:40]}"
            pred_disease = pred.get("predicted_disease", "?")
            print(
                f"  [{i + 1}/{len(manifest)}] {sample['crop']:10s} | {pv:20s} | GT: {sample['disease']:20s} | Pred: {pred_disease:25s} | {elapsed:.1f}s | {status}"
            )

            if delay_between_requests:
                time.sleep(delay_between_requests)

    results_path = output_path / f"benchmark_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    results_path.write_text(json.dumps(results, indent=2))
    print(f"\nResults saved to: {results_path}")

    return results


if __name__ == "__main__":
    import asyncio

    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_benchmark())
