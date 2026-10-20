from __future__ import annotations

import asyncio
import json
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone

import httpx

from app.adapters import RateLimitedError, get_adapter
from app.adapters.base import JobDetail
from app.core.config import get_settings
from app.core.store import company_key, get_store
from app.services.circuit_breaker import (
    is_circuit_open,
    open_circuit,
    record_failure,
    record_success,
)
from app.services.keyword_extractor import extract_keywords

logger = logging.getLogger(__name__)

QUEUE_CONFIG = {
    "jobkorea": {"queue": "enrich-jobkorea", "max_dispatches_per_second": 1.0, "max_concurrent": 1},
    "wanted": {"queue": "enrich-wanted", "max_dispatches_per_second": 1.0, "max_concurrent": 1},
    "jobplanet": {"queue": "enrich-jobplanet", "max_dispatches_per_second": 0.5, "max_concurrent": 1},
    "gamejob": {"queue": "enrich-gamejob", "max_dispatches_per_second": 0.5, "max_concurrent": 1},
}

_local_queues: dict[str, deque[dict]] = defaultdict(deque)
_queued_ids: set[str] = set()
_local_workers_started = False
_local_lock = asyncio.Lock()


async def enqueue_enrichment(job_id: str, site: str, url: str) -> None:
    settings = get_settings()
    if settings.use_cloud_tasks:
        await _enqueue_cloud_tasks(job_id, site, url)
    else:
        await _enqueue_local(job_id, site, url)


async def _enqueue_cloud_tasks(job_id: str, site: str, url: str) -> None:
    from google.cloud import tasks_v2

    settings = get_settings()
    config = QUEUE_CONFIG[site]
    client = tasks_v2.CloudTasksAsyncClient()
    parent = client.queue_path(settings.gcp_project, settings.gcp_location, config["queue"])
    task = {
        "http_request": {
            "http_method": tasks_v2.HttpMethod.POST,
            "url": f"{settings.worker_base_url.rstrip('/')}/internal/enrich",
            "body": json.dumps({"job_id": job_id, "site": site, "url": url}).encode(),
            "headers": {"Content-Type": "application/json"},
        }
    }
    await client.create_task(request={"parent": parent, "task": task})


async def ensure_local_workers() -> None:
    global _local_workers_started
    if _local_workers_started:
        return
    async with _local_lock:
        if _local_workers_started:
            return
        _local_workers_started = True
        for s in QUEUE_CONFIG:
            asyncio.create_task(_local_site_worker(s))
        asyncio.create_task(_pending_sweeper())
        logger.info("Local enrichment workers started")


async def _enqueue_local(job_id: str, site: str, url: str) -> None:
    await ensure_local_workers()
    if job_id in _queued_ids:
        return
    _queued_ids.add(job_id)
    _local_queues[site].append({"job_id": job_id, "site": site, "url": url})


async def _local_site_worker(site: str) -> None:
    rate = QUEUE_CONFIG[site]["max_dispatches_per_second"]
    delay = 1.0 / rate if rate > 0 else 1.0
    while True:
        if not _local_queues[site]:
            await asyncio.sleep(0.5)
            continue
        payload = _local_queues[site].popleft()
        job_id = payload["job_id"]
        try:
            await process_enrichment(job_id, payload["site"], payload["url"])
        except Exception:
            logger.exception("Local enrichment failed for %s", payload)
            # Guarantee we never leave jobs stuck in pending
            store = get_store()
            job = store.get_job(job_id)
            if job and job.get("status") == "pending":
                store.update_job(job_id, {"status": "failed"})
        finally:
            _queued_ids.discard(job_id)
        await asyncio.sleep(delay)


async def _pending_sweeper() -> None:
    """Re-queue jobs stuck in pending (e.g. after worker crash / reload)."""
    while True:
        await asyncio.sleep(20)
        try:
            store = get_store()
            # MemoryStore exposes jobs dict; FirestoreStore needs scan via scraps
            jobs = getattr(store, "jobs", None)
            if jobs is None:
                continue
            for job_id, job in list(jobs.items()):
                if job.get("status") != "pending":
                    continue
                if job_id in _queued_ids:
                    continue
                sources = job.get("sources") or []
                if not sources:
                    continue
                src = sources[0]
                await _enqueue_local(job_id, src["site"], src["url"])
        except Exception:
            logger.exception("pending sweeper error")


async def process_enrichment(job_id: str, site: str, url: str) -> None:
    store = get_store()
    job = store.get_job(job_id) or {}

    if await is_circuit_open(site):
        settings = get_settings()
        if not settings.use_cloud_tasks:
            # Don't spin forever — mark failed-soft after deferrals
            attempts = int(job.get("enrichAttempts", 0)) + 1
            store.update_job(job_id, {"enrichAttempts": attempts})
            if attempts < 3:
                await asyncio.sleep(2)
                await _enqueue_local(job_id, site, url)
                return
            await finalize_job(
                job_id,
                JobDetail(
                    title=job.get("title") or "제목 없음",
                    company_name=job.get("companyNameRaw") or "",
                    description=f"{job.get('title', '')} {job.get('companyNameRaw', '')}",
                ),
                [],
                status="failed",
            )
            return
        raise CircuitOpenError(site)

    attempts = int(job.get("enrichAttempts", 0)) + 1
    store.update_job(job_id, {"enrichAttempts": attempts})

    try:
        adapter = get_adapter(site)
        detail = await adapter.fetch_detail(url)
        # SPA shells often have little text — fall back to list metadata
        if len((detail.description or "").strip()) < 80:
            detail = JobDetail(
                title=detail.title or job.get("title") or "제목 없음",
                company_name=detail.company_name or job.get("companyNameRaw") or "",
                description=(
                    f"{detail.title or job.get('title', '')}\n"
                    f"{detail.company_name or job.get('companyNameRaw', '')}\n"
                    f"{detail.description or ''}"
                ),
            )
    except RateLimitedError:
        await open_circuit(site, cooldown_minutes=30)
        await _enqueue_local(job_id, site, url)
        return
    except Exception as exc:
        logger.warning("Enrich fetch failed job=%s site=%s: %s", job_id, site, exc)
        await record_failure(site)
        detail = JobDetail(
            title=job.get("title") or "제목 없음",
            company_name=job.get("companyNameRaw") or "",
            description=f"{job.get('title', '')} {job.get('companyNameRaw', '')}",
        )
        keywords = extract_keywords(detail.description)
        await finalize_job(
            job_id,
            detail,
            keywords,
            status="enriched" if keywords else "failed",
        )
        return

    keywords = extract_keywords(detail.description)
    # Even with no keywords, mark enriched so UI leaves the skeleton state
    await finalize_job(job_id, detail, keywords, status="enriched")
    await record_success(site)


async def finalize_job(
    job_id: str,
    detail: JobDetail,
    keywords: list[str],
    status: str = "enriched",
) -> None:
    store = get_store()
    cid = company_key(detail.company_name or "unknown")
    existing = store.get_company(cid)
    if not existing:
        store.set_company(
            cid,
            {
                "name": detail.company_name,
                "companyKey": cid,
            },
        )

    job = store.get_job(job_id) or {}
    title = (detail.title or job.get("title", "")).strip()
    company_name = (detail.company_name or job.get("companyNameRaw", "")).strip()

    payload = {
        "status": status,
        "title": title,
        "companyNameRaw": company_name,
        "companyId": cid,
        "keywords": keywords,
        "description": (detail.description or "")[:12000],
    }
    if status == "enriched":
        payload["enrichedAt"] = datetime.now(timezone.utc).isoformat()
    store.update_job(job_id, payload)


class CircuitOpenError(Exception):
    def __init__(self, site: str):
        self.site = site
        super().__init__(f"circuit open for {site}")


async def trigger_enrich_http(job_id: str, site: str, url: str) -> None:
    settings = get_settings()
    async with httpx.AsyncClient(timeout=30.0) as client:
        await client.post(
            f"{settings.worker_base_url.rstrip('/')}/internal/enrich",
            json={"job_id": job_id, "site": site, "url": url},
        )


async def requeue_all_pending() -> int:
    """Re-enqueue every pending job (used after sync / startup)."""
    store = get_store()
    jobs = getattr(store, "jobs", {}) or {}
    count = 0
    for job_id, job in list(jobs.items()):
        if job.get("status") != "pending":
            continue
        sources = job.get("sources") or []
        if not sources:
            continue
        src = sources[0]
        await enqueue_enrichment(job_id, src["site"], src["url"])
        count += 1
    return count
