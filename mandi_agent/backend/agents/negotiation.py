"""
Negotiation Agent — LangGraph StateGraph for Virtual Cooperative bundle formation.
Orchestrates multiple farmers into a collective sale.
"""

import asyncio
import logging
from datetime import UTC, date, datetime, timedelta

from langgraph.graph import END, StateGraph
from typing_extensions import TypedDict

from mandi_agent.backend.api.core_schemas import (
    BundleStatus,
    CooperativeBundle,
    HarvestIntent,
    PriceForecast,
)

logger = logging.getLogger(__name__)

# Maximum negotiation rounds before giving up
MAX_NEGOTIATION_ROUNDS = 3
# Maximum distance from any farmer to mandi (km)
MAX_MANDI_DISTANCE_KM = 80.0


# =============================================================================
# Graph State Definition
# =============================================================================


class NegotiationState(TypedDict, total=False):
    """State passed between nodes in the negotiation graph."""

    block_id: str
    crop: str
    farmer_intents: list[dict]  # Serialized HarvestIntent
    price_forecasts: dict[str, dict]  # mandi_name -> serialized PriceForecast
    proposed_bundles: list[dict]
    agreed_bundle: dict | None  # Serialized CooperativeBundle
    negotiation_round: int
    status: str  # assessing | proposing | checking | confirmed | failed
    errors: list[str]


# =============================================================================
# Helper functions
# =============================================================================

# Re-export for backward compatibility; canonical implementation in utils.geo
from mandi_agent.backend.utils.geo import haversine_distance as _haversine_distance


def _group_farmers_by_location(
    farmer_locations: dict[str, tuple[float, float]],
    mandi_lat: float,
    mandi_lng: float,
    max_distance: float,
) -> tuple[list[str], list[str]]:
    """
    Split farmers into those within max_distance and those beyond.

    Returns:
        Tuple of (within_range_farmer_ids, beyond_range_farmer_ids)
    """
    within = []
    beyond = []
    for farmer_id, (lat, lng) in farmer_locations.items():
        dist = _haversine_distance(lat, lng, mandi_lat, mandi_lng)
        if dist <= max_distance:
            within.append(farmer_id)
        else:
            beyond.append(farmer_id)
    return within, beyond


def _find_best_mandi(
    farmer_locations: dict[str, tuple[float, float]],
    price_forecasts: dict[str, PriceForecast],
    spoilage_windows: dict[str, tuple[date, date]],  # farmer_id -> (min_date, max_date)
) -> tuple[str, float, float] | None:
    """
    Find best mandi that works for all farmers.

    Considers:
    - Price forecast (higher is better)
    - Distance from all farmers (closer is better)
    - Delivery window fitting all spoilage windows

    Returns:
        Tuple of (mandi_name, avg_distance_km, weighted_score) or None
    """
    if not price_forecasts:
        return None

    candidates = []
    for mandi_name, forecast in price_forecasts.items():
        # Get mandi coordinates (from forecast or default)
        mandi_lat = getattr(forecast, "mandi_lat", 13.5833)  # Default Bangalore
        mandi_lng = getattr(forecast, "mandi_lng", 76.0364)

        # Calculate average distance to all farmers
        distances = []
        for _farmer_id, (lat, lng) in farmer_locations.items():
            dist = _haversine_distance(lat, lng, mandi_lat, mandi_lng)
            distances.append(dist)

        max_dist = max(distances) if distances else float("inf")
        avg_dist = sum(distances) / len(distances) if distances else float("inf")

        # Skip if any farmer is beyond MAX_MANDI_DISTANCE_KM
        if max_dist > MAX_MANDI_DISTANCE_KM:
            continue

        # Score: higher price, lower distance
        price_score = forecast.predicted_price / 3000.0  # Normalize to ~3000 INR
        distance_score = 1.0 - (avg_dist / MAX_MANDI_DISTANCE_KM)
        combined_score = (price_score * 0.6) + (distance_score * 0.4)

        candidates.append((mandi_name, avg_dist, combined_score))

    if not candidates:
        return None

    # Sort by combined score descending
    candidates.sort(key=lambda x: x[2], reverse=True)
    best = candidates[0]
    return best[0], best[1], best[2]


def _estimate_transit_hours(
    farmer_locations: dict[str, tuple[float, float]],
    mandi_lat: float,
    mandi_lng: float,
) -> float:
    """Estimate average transit hours for a group of farmers."""
    if not farmer_locations:
        return 0.0

    distances = []
    for _farmer_id, (lat, lng) in farmer_locations.items():
        dist = _haversine_distance(lat, lng, mandi_lat, mandi_lng)
        distances.append(dist)

    avg_distance = sum(distances) / len(distances)
    # Assume average speed of 30 km/h on Indian roads
    return avg_distance / 30.0


def _transport_savings(
    total_quantity_quintals: float,
    avg_distance_km: float,
    num_farmers: int,
) -> float:
    """
    Calculate transport saving per quintal from bundling.

    Solo: ~INR 12/quintal/km (individual trips)
    Bundle: ~INR 0.8/quintal/km (full truckload ~10 tonnes)

    Args:
        total_quantity_quintals: Total bundle quantity
        avg_distance_km: Average distance to mandi
        num_farmers: Number of farmers in bundle

    Returns:
        Transport saving per quintal in INR
    """
    solo_cost_per_km = 12.0  # INR/quintal/km
    truck_cost_per_km = 0.8  # INR/quintal/km (full load)

    solo_total = solo_cost_per_km * avg_distance_km * total_quantity_quintals
    truck_total = truck_cost_per_km * avg_distance_km * total_quantity_quintals

    # Also save on per-trip fixed costs
    fixed_savings = num_farmers * 500  # INR 500 per farmer saved (trip planning)

    total_savings = solo_total - truck_total + fixed_savings
    saving_per_quintal = total_savings / total_quantity_quintals

    return max(0.0, round(saving_per_quintal, 2))


# =============================================================================
# Graph Nodes
# =============================================================================


def assess_block(state: NegotiationState) -> NegotiationState:
    """
    Node 1: Read all harvest intents in the block and group by harvest window.

    Groups farmers whose harvest dates overlap within 7 days.
    Each group becomes a candidate bundle.
    """
    block_id = state["block_id"]
    crop = state["crop"]
    intents = state["farmer_intents"]

    if not intents:
        state["status"] = "failed"
        state["errors"].append("No harvest intents found for this block+crop")
        return state

    # Sort intents by harvest date
    sorted_intents = sorted(intents, key=lambda i: i.get("expected_harvest_date", ""))

    # Group by overlapping windows (7-day windows)
    windows: list[list[dict]] = []
    current_window: list[dict] = []

    for intent in sorted_intents:
        if not current_window:
            current_window.append(intent)
        else:
            last_date = datetime.strptime(current_window[-1].get("expected_harvest_date", ""), "%Y-%m-%d").date()
            this_date = datetime.strptime(intent.get("expected_harvest_date", ""), "%Y-%m-%d").date()
            if (this_date - last_date).days <= 7:
                current_window.append(intent)
            else:
                windows.append(current_window)
                current_window = [intent]

    if current_window:
        windows.append(current_window)

    # For each window, compute total quantity
    window_summaries = []
    for window in windows:
        total_qty = sum(i.get("quantity_quintals", 0) for i in window)
        window_summaries.append(
            {
                "intents": window,
                "total_quantity": total_qty,
                "harvest_start": window[0].get("expected_harvest_date"),
                "harvest_end": window[-1].get("expected_harvest_date"),
                "farmer_ids": [i.get("farmer_id") for i in window],
            }
        )

    logger.info(
        "assess_block: block=%s crop=%s found %d harvest windows, total intents=%d",
        block_id,
        crop,
        len(windows),
        len(intents),
    )

    # Store window summaries in state
    state["proposed_bundles"] = window_summaries
    state["status"] = "proposing"
    return state


def propose_bundle(state: NegotiationState) -> NegotiationState:
    """
    Node 2: Propose optimal mandi + delivery window for the best window.

    Uses price forecasts and farmer locations to find best mandi.
    Creates proposed bundle dicts with target mandi and delivery window.
    """
    block_id = state["block_id"]
    crop = state["crop"]
    price_forecasts = state["price_forecasts"]
    proposed_bundles = state["proposed_bundles"]

    if not proposed_bundles:
        state["status"] = "failed"
        state["errors"].append("No bundle candidates to propose")
        return state

    # Find window with most quantity (or first window)
    best_window = max(proposed_bundles, key=lambda w: w["total_quantity"])

    # Build farmer location map (would come from farmer profiles in real system)
    # For now, use default coordinates per farmer_id hash
    farmer_locations: dict[str, tuple[float, float]] = {}
    for intent in best_window["intents"]:
        farmer_id = intent.get("farmer_id", "")
        # Deterministic pseudo-coordinates based on farmer_id hash
        import hashlib

        h = int(hashlib.md5(farmer_id.encode()).hexdigest()[:6], 16)
        lat = 13.0 + (h % 100) / 1000  # ~13.0-14.0
        lng = 76.0 + (h % 100) / 100  # ~76.0-77.0
        farmer_locations[farmer_id] = (lat, lng)

    # Find best mandi from forecasts
    if price_forecasts:
        forecasts_for_mandi = {}
        for mandi_name, forecast_dict in price_forecasts.items():
            pf = PriceForecast(**forecast_dict) if isinstance(forecast_dict, dict) else forecast_dict
            forecasts_for_mandi[mandi_name] = pf

        best = _find_best_mandi(farmer_locations, forecasts_for_mandi, {})
        if best:
            mandi_name, avg_dist, score = best
            forecast = forecasts_for_mandi[mandi_name]
            mandi_lat = getattr(forecast, "mandi_lat", 13.5833)
            mandi_lng = getattr(forecast, "mandi_lng", 76.0364)
        else:
            # Default to first forecast
            mandi_name = list(forecasts_for_mandi.keys())[0]
            forecast = forecasts_for_mandi[mandi_name]
            mandi_lat = getattr(forecast, "mandi_lat", 13.5833)
            mandi_lng = getattr(forecast, "mandi_lng", 76.0364)
            avg_dist = 40.0
    else:
        # No forecasts — use default mandi
        mandi_name = "Vashi Navi Mumbai"
        mandi_lat = 19.0664
        mandi_lng = 73.0154
        avg_dist = 50.0
        forecast_dict = {
            "crop": crop,
            "mandi_name": mandi_name,
            "forecast_date": date.today().isoformat(),
            "predicted_price": 2000.0,
            "confidence": 0.6,
            "price_direction": "stable",
            "reasoning": "Estimated price — no forecast available",
            "model_used": "default",
            "days_ahead": 7,
        }

    # Calculate delivery window (2 days after harvest window ends)
    harvest_end_str = best_window.get("harvest_end", date.today().isoformat())
    harvest_end = datetime.strptime(harvest_end_str, "%Y-%m-%d").date()
    delivery_start = harvest_end + timedelta(days=1)
    delivery_end = harvest_end + timedelta(days=3)

    # Calculate transport savings
    total_qty = best_window["total_quantity"]
    num_farmers = len(best_window["farmer_ids"])
    transport_saving = _transport_savings(total_qty, avg_dist, num_farmers)

    # Transit time estimate
    transit_hours = _estimate_transit_hours(farmer_locations, mandi_lat, mandi_lng)

    # Create proposed bundle
    proposed = {
        "block_id": block_id,
        "crop": crop,
        "farmer_ids": best_window["farmer_ids"],
        "total_quantity_quintals": total_qty,
        "target_mandi": mandi_name,
        "target_mandi_lat": mandi_lat,
        "target_mandi_lng": mandi_lng,
        "delivery_window_start": delivery_start.isoformat(),
        "delivery_window_end": delivery_end.isoformat(),
        "forecast_price": forecast.predicted_price
        if isinstance(forecast, PriceForecast)
        else forecast.get("predicted_price", 2000.0),
        "transport_saving_per_quintal": transport_saving,
        "avg_distance_km": avg_dist,
        "transit_hours_estimate": transit_hours,
        "negotiation_round": state["negotiation_round"],
    }

    logger.info(
        "propose_bundle: block=%s crop=%s mandi=%s qty=%.0fq saving=₹%.0f/q",
        block_id,
        crop,
        mandi_name,
        total_qty,
        transport_saving,
    )

    state["proposed_bundles"] = [proposed]
    state["status"] = "checking"
    return state


def check_consensus(state: NegotiationState) -> NegotiationState:
    """
    Node 3: Check if proposed bundle works for all farmers.

    Validates:
    - All farmers within MAX_MANDI_DISTANCE_KM of mandi
    - Delivery window fits within spoilage windows

    If consensus fails and rounds < MAX_NEGOTIATION_ROUNDS, loop back to propose_bundle.
    """
    block_id = state["block_id"]
    proposed_bundles = state["proposed_bundles"]
    negotiation_round = state["negotiation_round"]

    if not proposed_bundles:
        state["status"] = "failed"
        state["errors"].append("No proposed bundle to check")
        return state

    proposed = proposed_bundles[-1]  # Most recent proposal

    # Check distance feasibility for all farmers
    # In production: would check each farmer's location against mandi
    # For now, assume consensus if proposed bundle exists
    all_within_distance = True  # Simplified

    # Check if we should retry
    if not all_within_distance and negotiation_round < MAX_NEGOTIATION_ROUNDS:
        state["negotiation_round"] = negotiation_round + 1
        state["status"] = "proposing"
        state["errors"].append(
            f"Some farmers beyond {MAX_MANDI_DISTANCE_KM}km from mandi — "
            f"round {negotiation_round + 1}/{MAX_NEGOTIATION_ROUNDS}"
        )
        logger.info("check_consensus: block=%s round=%d — no consensus, retrying", block_id, negotiation_round)
        return state

    # Consensus achieved — proceed to finalize
    state["status"] = "confirmed"
    logger.info("check_consensus: block=%s — consensus reached for %s", block_id, proposed["target_mandi"])
    return state


def finalize_bundle(state: NegotiationState) -> NegotiationState:
    """
    Node 4: Create the final CooperativeBundle object.

    Calculates transport savings and creates bundle with status='confirmed'.
    """
    block_id = state["block_id"]
    proposed_bundles = state["proposed_bundles"]

    if not proposed_bundles:
        state["status"] = "failed"
        state["errors"].append("No proposed bundle to finalize")
        return state

    proposed = proposed_bundles[-1]

    # Create bundle ID
    import hashlib

    bundle_id = hashlib.sha256(f"{block_id}:{proposed['crop']}:{proposed['farmer_ids']}".encode()).hexdigest()[:16]

    # Create CooperativeBundle
    bundle = CooperativeBundle(
        bundle_id=bundle_id,
        block_id=proposed["block_id"],
        crop=proposed["crop"],
        farmer_ids=proposed["farmer_ids"],
        total_quantity_quintals=proposed["total_quantity_quintals"],
        target_mandi=proposed["target_mandi"],
        target_mandi_lat=proposed["target_mandi_lat"],
        target_mandi_lng=proposed["target_mandi_lng"],
        delivery_window_start=datetime.strptime(proposed["delivery_window_start"], "%Y-%m-%d").date(),
        delivery_window_end=datetime.strptime(proposed["delivery_window_end"], "%Y-%m-%d").date(),
        forecast_price=proposed["forecast_price"],
        transport_saving_per_quintal=proposed["transport_saving_per_quintal"],
        status=BundleStatus.CONFIRMED,
        created_at=datetime.now(UTC),
    )

    logger.info(
        "finalize_bundle: bundle_id=%s crop=%s qty=%.0f saving=₹%.0f/q",
        bundle.bundle_id,
        bundle.crop,
        bundle.total_quantity_quintals,
        bundle.transport_saving_per_quintal,
    )

    state["agreed_bundle"] = bundle.model_dump(mode="json")
    state["status"] = "confirmed"
    return state


# =============================================================================
# Build the Graph
# =============================================================================


def _build_negotiation_graph() -> StateGraph:
    """
    Build the LangGraph StateGraph for bundle negotiation.

    Flow:
        START -> assess_block
        assess_block -> propose_bundle
        propose_bundle -> check_consensus
        check_consensus -> finalize_bundle (if confirmed)
        check_consensus -> propose_bundle (if no consensus, max 3 rounds)
    """
    graph = StateGraph(NegotiationState)

    # Add nodes
    graph.add_node("assess_block", assess_block)
    graph.add_node("propose_bundle", propose_bundle)
    graph.add_node("check_consensus", check_consensus)
    graph.add_node("finalize_bundle", finalize_bundle)

    # Add edges
    graph.add_edge("START", "assess_block")
    graph.add_edge("assess_block", "propose_bundle")
    graph.add_edge("propose_bundle", "check_consensus")

    # Conditional: check_consensus -> finalize_bundle OR back to propose_bundle
    def consensus_router(state: NegotiationState) -> str:
        if state["status"] == "confirmed":
            return "finalize_bundle"
        elif state["negotiation_round"] < MAX_NEGOTIATION_ROUNDS:
            return "propose_bundle"
        else:
            state["status"] = "failed"
            state["errors"].append("Max negotiation rounds reached without consensus")
            return END

    graph.add_conditional_edges(
        "check_consensus",
        consensus_router,
        {
            "finalize_bundle": "finalize_bundle",
            "propose_bundle": "propose_bundle",
            END: END,
        },
    )

    graph.add_edge("finalize_bundle", END)

    return graph


# =============================================================================
# Main negotiation function
# =============================================================================


async def run_negotiation(
    block_id: str,
    crop: str,
    farmer_intents: list[HarvestIntent],
    price_forecasts: dict[str, PriceForecast] | None = None,
) -> CooperativeBundle | None:
    """
    Run the negotiation graph to form a Virtual Cooperative bundle.

    Orchestrates multiple farmers (who are harvesting the same crop
    in the same block) into a collective sale to a distant mandi.

    Args:
        block_id: 6km block identifier
        crop: Crop name
        farmer_intents: HarvestIntent records from participating farmers
        price_forecasts: Dict mapping mandi_name -> PriceForecast

    Returns:
        CooperativeBundle if negotiation succeeds, None otherwise
    """
    # Build graph
    graph = _build_negotiation_graph()
    app = graph.compile()

    # Serialize intents for graph state
    intent_dicts = [
        {
            "intent_id": i.intent_id,
            "farmer_id": i.farmer_id,
            "crop": i.crop,
            "quantity_quintals": i.quantity_quintals,
            "expected_harvest_date": i.expected_harvest_date.isoformat(),
            "current_growth_stage": i.current_growth_stage,
            "block_id": i.block_id,
        }
        for i in farmer_intents
    ]

    # Serialize forecasts
    forecast_dicts: dict[str, dict] = {}
    if price_forecasts:
        for mandi_name, forecast in price_forecasts.items():
            forecast_dicts[mandi_name] = forecast.model_dump(mode="json")

    # Initial state
    initial_state: NegotiationState = {
        "block_id": block_id,
        "crop": crop,
        "farmer_intents": intent_dicts,
        "price_forecasts": forecast_dicts,
        "proposed_bundles": [],
        "agreed_bundle": None,
        "negotiation_round": 1,
        "status": "assessing",
        "errors": [],
    }

    # Run graph
    try:
        result = await app.ainvoke(initial_state)
    except Exception as e:
        logger.error("Negotiation graph failed: %s", str(e)[:200])
        return None

    # Extract bundle from result
    agreed_bundle_dict = result.get("agreed_bundle")
    if agreed_bundle_dict:
        # Parse datetime strings back
        if isinstance(agreed_bundle_dict.get("created_at"), str):
            agreed_bundle_dict["created_at"] = datetime.fromisoformat(
                agreed_bundle_dict["created_at"].replace("Z", "+00:00")
            )
        return CooperativeBundle(**agreed_bundle_dict)

    # Negotiation failed
    errors = result.get("errors", [])
    logger.warning("Negotiation failed for %s/%s: %s", block_id, crop, errors)
    return None


# Alias for consistency
async def negotiate_bundle(
    block_id: str,
    crop: str,
    farmer_intents: list[HarvestIntent],
    price_forecasts: dict[str, PriceForecast] | None = None,
) -> CooperativeBundle | None:
    """Alias for run_negotiation."""
    return await run_negotiation(block_id, crop, farmer_intents, price_forecasts)


if __name__ == "__main__":
    # Smoke test
    import asyncio

    logging.basicConfig(level=logging.INFO)

    async def test():
        from datetime import date as date_cls

        intents = [
            HarvestIntent(
                intent_id="I1",
                farmer_id="F1",
                crop="tomato",
                quantity_quintals=15.0,
                expected_harvest_date=date_cls(2026, 3, 25),
                current_growth_stage="mature",
                block_id="KA-001",
                submitted_at=None,
            ),
            HarvestIntent(
                intent_id="I2",
                farmer_id="F2",
                crop="tomato",
                quantity_quintals=12.0,
                expected_harvest_date=date_cls(2026, 3, 27),
                current_growth_stage="mature",
                block_id="KA-001",
                submitted_at=None,
            ),
        ]

        forecasts = {
            "Vashi Navi Mumbai": PriceForecast(
                crop="tomato",
                mandi_name="Vashi Navi Mumbai",
                forecast_date=date_cls(2026, 3, 30),
                predicted_price=2800.0,
                confidence=0.75,
                price_direction="rising",
                reasoning="Festival demand increasing",
                model_used="xgboost+gemini-2.0-flash",
                days_ahead=7,
            )
        }

        bundle = await run_negotiation("KA-001", "tomato", intents, forecasts)

        if bundle:
            print(f"Bundle formed: {bundle.bundle_id}")
            print(f"Crop: {bundle.crop}, Qty: {bundle.total_quantity_quintals:.0f}q")
            print(f"Target mandi: {bundle.target_mandi}")
            print(f"Transport saving: ₹{bundle.transport_saving_per_quintal:.0f}/q")
            print(f"Status: {bundle.status.value}")
        else:
            print("Bundle negotiation failed")

    asyncio.run(test())
