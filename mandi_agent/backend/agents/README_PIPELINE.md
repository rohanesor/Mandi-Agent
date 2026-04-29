# 3-Stage Deterministic Advisory Pipeline

## Problem Solved

**Before:** Advisory generation was random due to LLM sampling
- Same farmer input → different advisory on each run
- Advisory text varied unpredictably
- Hard to test, debug, or predict output
- User sees inconsistent guidance

**After:** Advisory generation is deterministic
- Same farmer input → identical advisory every time
- Structure locked in before text generation
- Easy to test, debug, verify
- Reliable guidance for farmers

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ STAGE 1: DETERMINISTIC DECISION ENGINE                      │
│ Rule-based harvest/hold/redirect decision                   │
│ Input:  PriceForecast + SpoilageRisk + Bundle               │
│ Output: StructuredDecision (locked-in decision)             │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 2: EXPLANATION EXTRACTOR                              │
│ Extract reasons from RAG context (no LLM randomness)        │
│ Input:  StructuredDecision + RAG chunks                     │
│ Output: StructuredExplanation (facts + reasoning)           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ STAGE 3: TEXT RENDERER                                      │
│ Template-based WhatsApp message generation                  │
│ Input:  StructuredDecision + StructuredExplanation          │
│ Output: RenderedAdvisory (deterministic text)               │
└─────────────────────────────────────────────────────────────┘
```

---

## Stage 1: Decision Engine (Deterministic Rules)

**File:** `decision_engine.py`

### Decision Rules (Priority Order)

1. **Critical Spoilage (≥60%)**
   - Always → `HARVEST_NOW`
   - Confidence: 95%

2. **Falling Prices**
   - Always → `HARVEST_NOW`
   - Confidence: 90%

3. **Bundle Available with High Saving (≥₹200/q)**
   - → `HOLD_3_DAYS` (organize logistics)
   - Confidence: 88%

4. **Rising Prices + Low Spoilage (<40%)**
   - → `HOLD_3_DAYS`
   - Confidence: 80%

5. **High Spoilage (40-60%) + Stable/Rising Prices**
   - → `HOLD_3_DAYS`
   - Confidence: 75%

6. **Default**
   - → `HARVEST_NOW`
   - Confidence: 70%

### Key Features

- **No LLM**: Pure rule-based logic
- **Deterministic**: Same inputs always produce same output
- **Testable**: Easy to verify with unit tests
- **Explainable**: Each decision has a primary + secondary factors
- **Factors**:
  - Spoilage categorized: CRITICAL, HIGH, MODERATE, LOW
  - Price direction: FALLING, RISING, STABLE
  - Bundle availability: YES/NO + savings level

### Output: StructuredDecision

```python
@dataclass
class StructuredDecision:
    decision: Decision                    # harvest_now/hold_3_days/etc
    primary_factor: DecisionFactor        # Why decision was made
    secondary_factors: list[DecisionFactor]
    spoilage_pct: float
    price_forecast_inr: float
    price_direction: PriceDirection
    target_mandi: str
    bundle_available: bool
    bundle_saving_per_q: Optional[float]
    decision_confidence: float            # 0.7-0.95
    reasoning_short: str                  # Human-readable reason
```

---

## Stage 2: Explanation Extractor (RAG-Based)

**File:** `explanation_extractor.py`

### What It Does

1. **Price Context**: Extracts from Agmarknet/e-NAM/KVK chunks why prices are moving
   - Keywords: "demand", "shortage", "oversupply", "quality decline"
   - Returns: 1-2 sentences from best RAG match

2. **Spoilage Context**: Extracts from ICAR shelf-life data
   - Keywords: "storage", "shelf life", "storage temperature"
   - Returns: Practical storage recommendation

3. **Supporting Facts**: Top 3 RAG chunks with similarity scores
   - Used for transparency + validation
   - Shows data sources farmer can trust

4. **Recommendation**: Auto-generated from decision + context
   - Action-oriented ("Wait 3 days", "Sell at Delhi")
   - Includes bundle savings if available

### Key Features

- **No LLM Sampling**: Deterministic extraction, not generation
- **RAG Context Used**: Grounds explanation in knowledge bases
- **Traceable**: Each fact has source + similarity score
- **Fallback**: Generic explanation if RAG has no relevant chunks

### Output: StructuredExplanation

```python
@dataclass
class StructuredExplanation:
    current_situation: str               # 1 sentence summary
    price_context: str                   # 1 sentence: why prices moving
    spoilage_context: str                # 1 sentence: storage context
    supporting_facts: list[str]          # Top 3 facts from RAG
    recommendation: str                  # Action to take
```

---

## Stage 3: Text Renderer (Template-Based)

**File:** `advisory_renderer.py`

### How It Works

1. **Match Decision Type**
   - HARVEST_NOW → urgent templates
   - HOLD_3_DAYS → waiting templates
   - etc.

2. **Find Applicable Template**
   - Templates have conditions (e.g., "if spoilage_pct >= 60")
   - First matching template selected
   - Fallback if no match

3. **Variable Substitution**
   - Replace: `{crop}`, `{price_forecast_inr}`, `{target_mandi}`, etc.
   - All variables come from structured data (no randomness)

4. **Output**
   - WhatsApp-friendly text (2-3 sentences)
   - Emoji indicator (🚜 harvest, ⏰ wait, etc.)
   - Action summary (1 line)

### Example Templates

**HARVEST_NOW (Critical Spoilage)**
```
🚜 Your {crop} needs to be harvested RIGHT NOW — spoilage risk is {spoilage_pct:.0f}%. 
Sell at {target_mandi} for ₹{price_forecast_inr:.0f}/quintal. {recommendation}
```

**HOLD_3_DAYS (Bundle Available)**
```
⏰ WAIT 3 DAYS. Your {crop} can be bundled with other farmers — 
Save ₹{bundle_saving_per_q:.0f}/quintal on transport! 
Prices will be ₹{price_forecast_inr:.0f}/q. {spoilage_context}
```

**HOLD_3_DAYS (Rising Prices)**
```
⏰ Wait 3 days. Prices for {crop} are RISING toward ₹{price_forecast_inr:.0f}/quintal. 
Spoilage risk is low ({spoilage_pct:.0f}%). {price_context}
```

### Key Features

- **Template Library**: Easy to customize per crop/language/region
- **Condition Matching**: Smart template selection based on decision factors
- **Fallback Chain**: Always produces output (generic if needed)
- **Deterministic**: No randomness in rendering

### Output: RenderedAdvisory

```python
@dataclass
class RenderedAdvisory:
    full_text: str                      # Complete WhatsApp message
    emoji_decision: str                 # Visual indicator (🚜, ⏰, etc)
    action_summary: str                 # 1-line summary
```

---

## Integration: How It All Works

```python
async def generate_advisory(
    farmer: FarmerProfile,
    intent: HarvestIntent,
    price_forecast: PriceForecast,
    spoilage_risk: SpoilageRisk,
    bundle: Optional[CooperativeBundle],
    rag_context: list[dict],
) -> FarmerAdvisory:

    # STAGE 1: Make decision (deterministic rules)
    structured_decision = make_decision(price_forecast, spoilage_risk, bundle)
    
    # STAGE 2: Extract explanation (RAG-based)
    explanation = extract_explanation(structured_decision, rag_context)
    
    # STAGE 3: Render text (template-based)
    rendered = render_advisory(structured_decision, explanation, intent.crop)
    
    # Build FarmerAdvisory
    advisory = FarmerAdvisory(
        decision=structured_decision.decision,
        full_text_english=rendered.full_text,
        confidence=structured_decision.decision_confidence,
        ...
    )
    
    return advisory
```

---

## Testing & Verification

**File:** `test_pipeline.py`

### Test Coverage

1. **Deterministic Decisions**
   - Run same scenario 3 times → identical output
   - ✅ PASS

2. **Deterministic Explanations**
   - Extract explanation 3 times → identical output
   - ✅ PASS

3. **Deterministic Rendering**
   - Render text 3 times → identical output
   - ✅ PASS

4. **Decision Rules**
   - All 6 rules tested
   - Edge cases verified
   - ✅ PASS

5. **Bundle Preference**
   - Bundle mandi selection tested
   - Savings included correctly
   - ✅ PASS

### Run Tests

```bash
cd mandi_agent
python -m pytest backend/agents/test_pipeline.py -v
```

**Result:** All 5 tests pass ✅

---

## Advantages Over LLM-Only Approach

| Aspect | Before (LLM) | After (Pipeline) |
|--------|-------------|-----------------|
| **Consistency** | 🔴 Random variations | 🟢 Identical every time |
| **Testability** | 🔴 Hard to test | 🟢 100% testable |
| **Debugging** | 🔴 Unpredictable | 🟢 Rules-based, traceable |
| **Cost** | 🔴 LLM API calls | 🟢 No LLM needed (saves $) |
| **Speed** | 🔴 LLM latency (1-3s) | 🟢 <100ms |
| **Reliability** | 🔴 API failures | 🟢 Offline-capable |
| **Explainability** | 🔴 Black box | 🟢 Clear decision rules |

---

## Future Enhancements

1. **Multi-language Support**
   - Translate templates for Hindi, Tamil, Telugu, etc.
   - Use Reverie for voice rendering

2. **Template Customization**
   - Per-crop templates (wheat vs. tomato vs. cotton)
   - Per-region templates (different markets)
   - Per-farmer-segment templates (smallholder vs. progressive)

3. **A/B Testing**
   - Test different templates with farmer segments
   - Optimize for engagement/adoption

4. **Learning Loop**
   - Track advisory → actual outcomes
   - Adjust confidence scores based on prediction accuracy
   - Refine rule thresholds

5. **Real-time Updates**
   - If prices change dramatically mid-day → re-generate advisory
   - WebSocket push to farmers

---

## Files Modified/Created

### New Files
- `decision_engine.py` — Stage 1: Rule-based decisions
- `explanation_extractor.py` — Stage 2: RAG-based explanations
- `advisory_renderer.py` — Stage 3: Template-based rendering
- `test_pipeline.py` — Comprehensive integration tests
- `README_PIPELINE.md` — This documentation

### Modified Files
- `rag_advisory.py` — Refactored to use 3-stage pipeline

---

## Migration Guide

If your code calls `generate_advisory()`, no changes needed! The function signature is the same:

```python
# Before and after use the same API
advisory = await generate_advisory(
    farmer, intent, price_forecast, spoilage_risk, bundle, rag_context
)
```

The only difference: output is now deterministic! 🎉

---

## Troubleshooting

### Advisory seems generic
- Check RAG context has relevant chunks
- Verify `similarity` scores > 0.7
- Add more diverse chunks to knowledge base

### Decision doesn't match expectations
- Review `decision_engine.py` rule logic
- Check decision factors match your domain
- Add new rule if edge case missing

### Text doesn't fit WhatsApp
- Adjust template length (target 2-3 sentences)
- Use emoji to save characters
- Test rendering with `render_advisory()`

---

## Contact & Support

For issues with:
- **Decision Logic**: See `decision_engine.py` rules
- **RAG Extraction**: Check `explanation_extractor.py` keywords
- **Text Rendering**: Review templates in `advisory_renderer.py`
- **Testing**: Run `test_pipeline.py`
