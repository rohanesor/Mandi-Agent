"""Government scheme eligibility matcher."""

from __future__ import annotations

from mandi_agent.backend.api.core_schemas import FarmerProfile, GovtScheme


def _score_land_smallholder(acres: float) -> float:
    if acres <= 2.5:
        return 1.0
    if acres <= 5:
        return 0.7
    return 0.4


async def check_scheme_eligibility(farmer: FarmerProfile) -> list[GovtScheme]:
    """Match farmer with eligible government schemes."""
    schemes: list[GovtScheme] = []

    pm_kisan_score = _score_land_smallholder(farmer.landholding_acres)
    schemes.append(
        GovtScheme(
            scheme_id="pm-kisan",
            scheme_name="PM-KISAN",
            state="all",
            benefits_summary="Income support installment for eligible farmer families",
            eligibility_score=pm_kisan_score,
            eligibility_reason="Based on landholding size and active farming status",
            required_documents=["Aadhaar", "Land record", "Bank account"],
            next_steps=["Verify land record in local portal", "Submit eKYC at CSC"],
        )
    )

    irrigation_bonus = 0.2 if (farmer.irrigation_type or "").lower() == "rainfed" else 0.0
    pmfby_score = min(1.0, 0.6 + irrigation_bonus)
    schemes.append(
        GovtScheme(
            scheme_id="pmfby",
            scheme_name="Pradhan Mantri Fasal Bima Yojana",
            state="all",
            benefits_summary="Crop insurance against weather and yield loss",
            eligibility_score=pmfby_score,
            eligibility_reason="Crop cultivation and seasonal enrollment window",
            required_documents=["Aadhaar", "Sown crop declaration", "Bank passbook"],
            next_steps=["Enroll before cut-off date", "Link bank account for claim settlement"],
        )
    )

    if farmer.category and farmer.category.lower() in {"sc", "st"}:
        schemes.append(
            GovtScheme(
                scheme_id="scst-agri-support",
                scheme_name="SC/ST Agri Equipment Subsidy",
                state="all",
                benefits_summary="Capital subsidy for tools and irrigation assets",
                eligibility_score=0.84,
                eligibility_reason="Category-linked subsidy eligibility",
                required_documents=["Caste certificate", "Aadhaar", "Quotation"],
                next_steps=["Apply through district agriculture office"],
            )
        )

    # Kisan Credit Card — applicable to all active farmers
    kcc_score = 0.75 if farmer.landholding_acres >= 0.5 else 0.5
    schemes.append(
        GovtScheme(
            scheme_id="kcc",
            scheme_name="Kisan Credit Card",
            state="all",
            benefits_summary="Low-interest crop loan up to ₹3 lakh with 2% interest subvention",
            eligibility_score=kcc_score,
            eligibility_reason="All farmers with cultivable land are eligible for KCC",
            required_documents=["Aadhaar", "Land record", "Passport photo", "Bank account"],
            next_steps=["Apply at nearest bank branch", "Submit land ownership proof"],
        )
    )

    # Soil Health Card — universal for all farmers
    schemes.append(
        GovtScheme(
            scheme_id="soil-health-card",
            scheme_name="Soil Health Card Scheme",
            state="all",
            benefits_summary="Free soil testing and fertilizer recommendations for optimal yield",
            eligibility_score=0.90,
            eligibility_reason="Available to all farmers with cultivable land",
            required_documents=["Aadhaar", "Land record"],
            next_steps=["Visit nearest Krishi Vigyan Kendra for soil sample collection"],
        )
    )

    # Micro Irrigation Fund — bonus for drip/sprinkler users or rainfed farmers
    if farmer.irrigation_type and farmer.irrigation_type.lower() in {"rainfed", "drip", "borewell"}:
        micro_score = 0.82 if farmer.irrigation_type.lower() == "rainfed" else 0.65
        schemes.append(
            GovtScheme(
                scheme_id="micro-irrigation",
                scheme_name="Pradhan Mantri Krishi Sinchayee Yojana (Micro Irrigation)",
                state="all",
                benefits_summary="55-80% subsidy on drip and sprinkler irrigation systems",
                eligibility_score=micro_score,
                eligibility_reason=f"Farmer uses {farmer.irrigation_type} irrigation — eligible for micro-irrigation subsidy",
                required_documents=["Aadhaar", "Land record", "Quotation from approved vendor"],
                next_steps=["Apply through state horticulture/agriculture department portal"],
            )
        )

    schemes.sort(key=lambda s: s.eligibility_score, reverse=True)
    return schemes
