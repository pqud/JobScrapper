from __future__ import annotations

from dataclasses import dataclass

from app.adapters.base import JobDetail
from app.core.store import get_store, make_job_key
from app.models.schemas import BrowserJobDetail
from app.services.blocked_content import looks_blocked
from app.services.enrichment_worker import finalize_job
from app.services.keyword_extractor import extract_keywords


@dataclass
class DetailIngestResult:
    updated: int
    blocked: int


async def ingest_browser_details(
    uid: str, items: list[BrowserJobDetail]
) -> DetailIngestResult:
    """Apply job details scraped inside the user's browser (logged-in session)."""
    store = get_store()
    updated = 0
    blocked = 0

    for item in items:
        job_id = make_job_key(item.site, item.originalId)
        # Ensure this user has the scrap
        scrap = store.get_scrap(uid, job_id)
        job = store.get_job(job_id)
        if scrap is None and job is None:
            continue

        text_blob = f"{item.title}\n{item.companyName}\n{item.description}"
        if looks_blocked(text_blob) or looks_blocked(item.description):
            await finalize_job(
                job_id,
                JobDetail(
                    title=item.title or (job or {}).get("title") or "제목 없음",
                    company_name=item.companyName
                    or (job or {}).get("companyNameRaw")
                    or "",
                    description="",
                ),
                [],
                status="failed",
            )
            blocked += 1
            continue

        keywords = extract_keywords(item.description or text_blob)
        await finalize_job(
            job_id,
            JobDetail(
                title=item.title or (job or {}).get("title") or "제목 없음",
                company_name=item.companyName
                or (job or {}).get("companyNameRaw")
                or "",
                description=item.description,
                posted_at=item.postedAt,
            ),
            keywords,
            status="enriched",
        )
        updated += 1

    return DetailIngestResult(updated=updated, blocked=blocked)


def list_pending_enrichment(uid: str) -> list[dict]:
    store = get_store()
    out: list[dict] = []
    for job_id, _scrap in store.list_scraps(uid):
        job = store.get_job(job_id)
        if not job or job.get("status") != "pending":
            continue
        sources = job.get("sources") or []
        if not sources:
            continue
        src = sources[0]
        out.append(
            {
                "jobId": job_id,
                "site": src["site"],
                "originalId": src["originalId"],
                "url": src["url"],
                "title": job.get("title") or "",
            }
        )
    return out
