from collections import Counter

from fastapi import APIRouter, Depends

from app.core.auth import get_current_uid
from app.core.store import get_store
from app.models.schemas import InsightsResponse, KeywordCount

router = APIRouter(tags=["insights"])


@router.get("/scraps/insights", response_model=InsightsResponse)
async def scrap_insights(uid: str = Depends(get_current_uid)):
    store = get_store()
    rows = store.list_scraps(uid)
    counter: Counter[str] = Counter()
    pending = 0
    enriched = 0

    for job_id, _ in rows:
        job = store.get_job(job_id)
        if not job:
            continue
        status = job.get("status")
        if status == "pending":
            pending += 1
            continue
        if status == "enriched":
            enriched += 1
            for kw in job.get("keywords") or []:
                counter[kw] += 1

    keywords = [
        KeywordCount(keyword=k, count=c)
        for k, c in counter.most_common(50)
    ]
    return InsightsResponse(
        keywords=keywords,
        pending_count=pending,
        enriched_count=enriched,
    )
