from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.config import get_settings
from app.core.store import get_store, make_job_key, utcnow
from app.models.schemas import RawScrapItem
from app.services.enrichment_worker import enqueue_enrichment


@dataclass
class SyncResult:
    synced_count: int
    pending_count: int


async def merge_source_if_new(job_id: str, item: RawScrapItem) -> None:
    store = get_store()
    job = store.get_job(job_id)
    if not job:
        return
    sources = list(job.get("sources") or [])
    key = (item.site, item.originalId)
    exists = any((s.get("site"), s.get("originalId")) == key for s in sources)
    if not exists:
        sources.append(
            {
                "site": item.site,
                "originalId": item.originalId,
                "url": item.url,
            }
        )
        store.update_job(job_id, {"sources": sources})


async def upsert_scrap_batch(uid: str, items: list[RawScrapItem]) -> SyncResult:
    store = get_store()
    synced, pending = 0, 0

    for item in items:
        job_id = make_job_key(item.site, item.originalId)
        job = store.get_job(job_id)

        if not job:
            store.set_job(
                job_id,
                {
                    "id": job_id,
                    "status": "pending",
                    "title": item.title,
                    "companyNameRaw": item.companyName,
                    "companyId": None,
                    "keywords": [],
                    "sources": [
                        {
                            "site": item.site,
                            "originalId": item.originalId,
                            "url": item.url,
                        }
                    ],
                    "createdAt": utcnow().isoformat(),
                },
            )
            # JobKorea 등: 서버 fetch 대신 브라우저 확장 보강 대기
            if item.site not in get_settings().browser_enrich_site_set:
                await enqueue_enrichment(job_id, item.site, item.url)
            pending += 1
        else:
            await merge_source_if_new(job_id, item)
            # Re-enrich failed OR stuck-pending jobs (queue can be lost on reload)
            if job.get("status") in ("failed", "pending"):
                store.update_job(job_id, {"status": "pending"})
                if item.site not in get_settings().browser_enrich_site_set:
                    await enqueue_enrichment(job_id, item.site, item.url)
                pending += 1
            else:
                synced += 1

        store.set_scrap(
            uid,
            job_id,
            {"scrapedAt": item.scrapedAt, "site": item.site},
            merge=True,
        )

    store.set_last_synced(uid, datetime.now(timezone.utc))
    return SyncResult(synced_count=synced, pending_count=pending)
