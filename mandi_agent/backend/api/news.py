"""
News and Notification routes.
"""

import logging
import uuid
from typing import Any, Optional

from fastapi import APIRouter, Body

router = APIRouter(tags=["News"])
logger = logging.getLogger(__name__)


@router.get("/api/news")
async def get_news(limit: int = 20, category: Optional[str] = None) -> dict[str, Any]:
    """Get latest agricultural news with AI relevance analysis."""
    from mandi_agent.backend.data_sources.agri_news import get_all_agri_news
    from mandi_agent.backend.agents.news_agent import analyze_article

    articles = await get_all_agri_news()
    analyzed: list[dict[str, Any]] = []

    for article in articles[: max(limit * 2, 20)]:
        try:
            analysis = await analyze_article(
                article.get("title", ""),
                article.get("description", ""),
            )

            if not analysis.is_relevant:
                continue

            if category and analysis.category.lower() != category.lower():
                continue

            analyzed.append(
                {
                    **article,
                    "article_id": article.get("url") or str(uuid.uuid4()),
                    "relevance_score": analysis.relevance_score,
                    "urgency_level": analysis.urgency_level,
                    "crops_affected": analysis.crops_affected,
                    "states_affected": analysis.states_affected,
                    "headline_short": analysis.headline_short,
                    "farmer_action": analysis.farmer_action,
                    "category": analysis.category,
                }
            )
        except Exception:
            continue

    return {"articles": analyzed[:limit], "total": len(analyzed[:limit])}


@router.post("/api/news/notify")
async def notify_farmers_of_news(req: dict = Body(...)) -> dict[str, Any]:
    """Trigger WhatsApp + push notification for urgent news (n8n handles delivery)."""
    article_id = req.get("article_id") or req.get("alert_id")
    urgency = req.get("urgency", "normal")
    notification_id = str(uuid.uuid4())

    logger.info(
        "Notification received: id=%s article_id=%s urgency=%s",
        notification_id, article_id, urgency,
    )

    return {
        "ok": True,
        "notification_id": notification_id,
        "article_id": article_id,
        "urgency": urgency,
        "message": "Notification trigger acknowledged. n8n handles downstream delivery.",
    }
