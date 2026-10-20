from fastapi import APIRouter, Depends, HTTPException

from app.api.jobs import _to_job_out
from app.core.auth import get_current_uid
from app.core.store import get_store
from app.models.schemas import ScrapItemOut, ScrapListResponse

router = APIRouter(tags=["scraps"])


@router.get("/scraps", response_model=ScrapListResponse)
async def list_scraps(uid: str = Depends(get_current_uid)):
    store = get_store()
    rows = store.list_scraps(uid)
    items: list[ScrapItemOut] = []
    pending = 0

    for job_id, scrap in rows:
        job_data = store.get_job(job_id)
        job_out = _to_job_out(job_id, job_data) if job_data else None
        if job_out and job_out.status == "pending":
            pending += 1
        items.append(
            ScrapItemOut(
                jobId=job_id,
                scrapedAt=scrap.get("scrapedAt"),
                job=job_out,
            )
        )

    # Newest scrap first
    items.sort(key=lambda x: x.scrapedAt or "", reverse=True)

    return ScrapListResponse(
        items=items,
        pending_enrichment=pending,
        last_synced_at=store.get_last_synced(uid),
    )


@router.delete("/scraps/{job_id}")
async def delete_scrap(job_id: str, uid: str = Depends(get_current_uid)):
    store = get_store()
    ok = store.delete_scrap(uid, job_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Scrap not found")
    return {"deleted": True}
