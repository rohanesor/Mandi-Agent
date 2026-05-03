"""
Safety guardrails — validates advisories and farmer data.

Re-exports from the main guardrails agent module for backward compatibility.
All guardrail logic lives in backend.agents.guardrails.

This module provides convenient imports:
    from mandi_agent.backend.agents.guardrails.safety import validate_advisory
    from mandi_agent.backend.agents.guardrails.safety import GuardrailAgent
"""

from mandi_agent.backend.agents.guardrails import (
    GuardrailAgent,
    validate_advisory,
)

__all__ = [
    "GuardrailAgent",
    "validate_advisory",
]
