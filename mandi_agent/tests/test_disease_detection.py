"""
Tests for disease detection agent.

Tests prompt building, fallback behavior, and schema validation.
Integration tests for Gemini Vision require GEMINI_API_KEY.
"""

import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from mandi_agent.backend.agents.disease_detector import (
    _build_prompt,
    _fallback_diagnosis,
    CROP_DISEASE_CONTEXT,
)
from mandi_agent.backend.api.core_schemas import DiseaseDiagnosis, Severity


class TestBuildPrompt:
    """Test prompt construction for different crops."""

    def test_prompt_contains_crop_name(self):
        prompt = _build_prompt("Tomato")
        assert "Tomato" in prompt
        assert "agricultural pathologist" in prompt

    def test_prompt_contains_disease_list_for_known_crop(self):
        prompt = _build_prompt("tomato")
        assert "Early Blight" in prompt
        assert "Late Blight" in prompt
        assert "Bacterial Spot" in prompt

    def test_prompt_contains_healthy_description(self):
        prompt = _build_prompt("potato")
        assert "Healthy" in prompt
        assert "green leaves" in prompt.lower()

    def test_prompt_contains_json_format_instructions(self):
        prompt = _build_prompt("rice")
        assert "disease_name" in prompt
        assert "confidence" in prompt
        assert "severity" in prompt
        assert "symptoms_observed" in prompt

    def test_prompt_contains_specific_product_guidance(self):
        prompt = _build_prompt("onion")
        # Should ask for specific products in the response
        assert "specific" in prompt.lower()

    def test_unknown_crop_gets_basic_prompt(self):
        prompt = _build_prompt("Papaya")
        assert "Papaya" in prompt
        assert "agricultural pathologist" in prompt
        # No disease list for unknown crops
        assert "Known diseases for" not in prompt


class TestFallbackDiagnosis:
    """Test fallback behavior when API fails."""

    def test_tomato_fallback(self):
        result = _fallback_diagnosis("tomato")
        assert isinstance(result, DiseaseDiagnosis)
        assert "blight" in result.disease_name.lower()
        assert result.confidence == 0.45
        assert result.severity == Severity.MEDIUM
        assert result.escalation_required is True

    def test_potato_fallback(self):
        result = _fallback_diagnosis("potato")
        assert "late blight" in result.disease_name.lower()
        assert len(result.symptoms_observed) > 0

    def test_unknown_crop_fallback(self):
        result = _fallback_diagnosis("mango")
        assert result.disease_name == "Leaf disease (suspected)"
        assert result.confidence == 0.45
        assert result.escalation_required is True

    def test_case_insensitive_crop(self):
        result_lower = _fallback_diagnosis("tomato")
        result_upper = _fallback_diagnosis("TOMATO")
        assert result_lower.disease_name == result_upper.disease_name

    def test_fallback_has_preventive_actions(self):
        result = _fallback_diagnosis("rice")
        assert len(result.preventive_actions) >= 2
        assert len(result.treatment_actions) >= 2

    def test_fallback_has_diagnosis_id(self):
        result = _fallback_diagnosis("chilli")
        assert result.diagnosis_id.startswith("diag-")
        assert len(result.diagnosis_id) > 10


class TestCropDiseaseContext:
    """Test disease context data completeness."""

    def test_all_target_crops_have_context(self):
        target_crops = ["tomato", "potato", "onion", "rice", "wheat", "chilli", "corn"]
        for crop in target_crops:
            assert crop in CROP_DISEASE_CONTEXT, f"Missing context for {crop}"

    def test_each_crop_has_diseases_and_healthy(self):
        for crop, ctx in CROP_DISEASE_CONTEXT.items():
            assert "diseases" in ctx, f"{crop} missing diseases"
            assert "healthy" in ctx, f"{crop} missing healthy description"
            assert len(ctx["diseases"]) >= 2, f"{crop} has too few diseases"

    def test_disease_entries_have_symptoms(self):
        for crop, ctx in CROP_DISEASE_CONTEXT.items():
            for disease_name, symptoms in ctx["diseases"]:
                assert len(symptoms) > 10, f"{crop}/{disease_name} symptoms too short"

    def test_tomato_has_comprehensive_disease_list(self):
        tomato_diseases = [d[0] for d in CROP_DISEASE_CONTEXT["tomato"]["diseases"]]
        assert len(tomato_diseases) >= 8
        assert any("Early Blight" in d for d in tomato_diseases)
        assert any("Late Blight" in d for d in tomato_diseases)
        assert any("Bacterial" in d for d in tomato_diseases)


@pytest.mark.asyncio
class TestDiseaseDetectionIntegration:
    """Integration tests requiring GEMINI_API_KEY."""

    async def test_detect_crop_disease_valid_response(self):
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "disease_name": "Early Blight",
            "confidence": 0.85,
            "severity": "medium",
            "symptoms_observed": ["brown spots", "concentric rings"],
            "preventive_actions": ["crop rotation", "remove debris"],
            "treatment_actions": ["Mancozeb 2.5g/L"],
            "escalation_required": False,
        })

        with patch("mandi_agent.backend.agents.disease_detector.base64.b64decode", return_value=b"fake_image_data"), \
             patch("mandi_agent.backend.agents.disease_detector._get_model") as mock_model:
            mock_instance = MagicMock()
            mock_instance.generate_content_async = AsyncMock(return_value=mock_response)
            mock_model.return_value = mock_instance

            result = await __import__("mandi_agent.backend.agents.disease_detector", fromlist=["detect_crop_disease"]).detect_crop_disease(
                "fake_base64_image_data", "tomato"
            )

            assert isinstance(result, DiseaseDiagnosis)
            assert result.crop == "tomato"
            assert result.disease_name == "Early Blight"
            assert result.confidence == 0.85
            assert result.severity == Severity.MEDIUM
            assert len(result.symptoms_observed) == 2
            assert not result.escalation_required

    async def test_detect_crop_disease_healthy_detection(self):
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "disease_name": "Healthy",
            "confidence": 0.95,
            "severity": "low",
            "symptoms_observed": ["green leaves", "no spots"],
            "preventive_actions": ["maintain current practices"],
            "treatment_actions": [],
            "escalation_required": False,
        })

        with patch("mandi_agent.backend.agents.disease_detector.base64.b64decode", return_value=b"fake_image_data"), \
             patch("mandi_agent.backend.agents.disease_detector._get_model") as mock_model:
            mock_instance = MagicMock()
            mock_instance.generate_content_async = AsyncMock(return_value=mock_response)
            mock_model.return_value = mock_instance

            result = await __import__("mandi_agent.backend.agents.disease_detector", fromlist=["detect_crop_disease"]).detect_crop_disease(
                "fake_base64_image_data", "potato"
            )

            assert result.disease_name == "Healthy"
            assert result.confidence >= 0.9
            assert result.severity == Severity.LOW

    async def test_detect_crop_disease_error_fallback(self):
        with patch("mandi_agent.backend.agents.disease_detector._get_model") as mock_model:
            mock_model.side_effect = Exception("API error")

            result = await __import__("mandi_agent.backend.agents.disease_detector", fromlist=["detect_crop_disease"]).detect_crop_disease(
                "fake_base64_image_data", "onion"
            )

            assert isinstance(result, DiseaseDiagnosis)
            assert result.escalation_required is True
            assert result.confidence < 0.5
