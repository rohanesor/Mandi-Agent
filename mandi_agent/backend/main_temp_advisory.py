@app.post("/api/advisory")
async def generate_advisory(request: dict):
    """Generate harvest advisory for a farmer."""
    try:
        import random
        from datetime import datetime
        farmer_id = request.get("farmer_id", "F-KA-2847")
        crop = request.get("crop", "Tomato")
        language = request.get("language", "kn")
        
        # Simulate some dynamic logic based on the crop
        prices = {"Tomato": 34, "Onion": 22, "Potato": 18, "Chilli": 160}
        base_price = prices.get(crop, 30)
        
        # Add some randomness
        forecast_price = base_price + random.randint(-5, 10)
        spoilage_risk_pct = random.randint(15, 65)
        
        # Simple decision logic
        if spoilage_risk_pct > 50:
            decision = "harvest_now"
            advice_en = f"Harvest your {crop} immediately. Spoilage risk is high at {spoilage_risk_pct}%, and prices at your local mandi are stable at ₹{forecast_price}/kg."
            advice_local = {
                "kn": f"{crop} ತಕ್ಷಣ ಕೊಯ್ಲು ಮಾಡಿ. ಹಾನಿಯ ಅಪಾಯ {spoilage_risk_pct}% ಹೆಚ್ಚಿದೆ. ಬೆಲೆ ₹{forecast_price} ಇದೆ.",
                "hi": f"{crop} की तुरंत कटाई करें। खराब होने का जोखिम {spoilage_risk_pct}% है। कीमत ₹{forecast_price} है。",
            }
        else:
            decision = "hold_3_days"
            advice_en = f"Hold your {crop} for 3 days. We expect the price to rise to ₹{forecast_price}/kg, and the weather is favorable with low spoilage risk ({spoilage_risk_pct}%)."
            advice_local = {
                "kn": f"{crop} ಅನ್ನು 3 ದಿನಗಳ ಕಾಲ ಇರಿಸಿ. ಬೆಲೆ ₹{forecast_price}/ಕೆಜಿಗೆ ಏರುವ ನಿರೀಕ್ಷೆಯಿದೆ.",
                "hi": f"{crop} को 3 दिनों के लिए रोकें। कीमत ₹{forecast_price}/किलो तक बढ़ने की उम्मीद है।",
            }

        payload = {
            "session_id": f"SESSION-{farmer_id}-{random.randint(100, 999)}",
            "farmer_id": farmer_id,
            "input_text_local": f"{crop}ಗೆ ಕಿಮ್ಮತ್ತು ಏನಿದೆ?",
            "input_text_english": f"What is the advice for my {crop}?",
            "detected_language": language,
            "response_text_local": advice_local.get(language, advice_en),
            "response_text_english": advice_en,
            "response_audio_url": None,
            "processing_ms": random.randint(2000, 5000),
            "advisory": {
                "advisory_id": f"ADV-{farmer_id}-{random.randint(100, 999)}",
                "farmer_id": farmer_id,
                "crop": crop,
                "language": language,
                "decision": decision,
                "target_mandi": "Local APMC Mandi",
                "forecast_price": forecast_price,
                "current_price": base_price,
                "spoilage_risk_pct": spoilage_risk_pct,
                "bundle_available": random.random() > 0.5,
                "bundle_saving": 180 if random.random() > 0.5 else 0,
                "confidence": 0.85 + (random.random() * 0.1),
                "guardrail_status": "approved",
                "full_text_local": advice_local.get(language, advice_en),
                "full_text_english": advice_en,
                "created_at": datetime.utcnow().isoformat()
            },
            "created_at": datetime.utcnow().isoformat()
        }

        if bool(request.get("force_sms_fallback", False)):
            from mandi_agent.backend.agents.sms_fallback import deliver_sms
            from mandi_agent.backend.models.schemas import FarmerAdvisory as FarmerAdvisoryModel, FarmerProfile as FarmerProfileModel

            advisory_model = FarmerAdvisoryModel(
                advisory_id=payload["advisory"]["advisory_id"],
                farmer_id=farmer_id,
                crop=crop,
                language=language,
                decision=payload["advisory"]["decision"],
                target_mandi=payload["advisory"]["target_mandi"],
                forecast_price=float(payload["advisory"]["forecast_price"]),
                spoilage_risk_pct=float(payload["advisory"]["spoilage_risk_pct"]),
                bundle_available=bool(payload["advisory"]["bundle_available"]),
                bundle_saving=float(payload["advisory"]["bundle_saving"]),
                full_text_english=payload["advisory"]["full_text_english"],
                full_text_local=payload["advisory"]["full_text_local"],
                confidence=float(payload["advisory"]["confidence"]),
                guardrail_status=payload["advisory"]["guardrail_status"],
            )
            farmer_model = FarmerProfileModel(
                farmer_id=farmer_id,
                name=str(request.get("farmer_name", "Farmer")),
                phone=str(request.get("phone", "+919000000000")),
                language=language,
                location=str(request.get("location", "Unknown")),
                latitude=float(request.get("latitude", 12.97)),
                longitude=float(request.get("longitude", 77.59)),
                block_id=str(request.get("block_id", "unknown-block")),
                crops=[crop],
                landholding_acres=float(request.get("landholding_acres", 2.0)),
                has_smartphone=False,
                sms_opt_in=True,
            )
            delivery = await deliver_sms(advisory_model, farmer_model)
            payload["delivery"] = delivery.model_dump(mode="json")

        return payload
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Advisory generation failed — {str(e)}"
        )
