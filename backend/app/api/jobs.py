from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_uid
from app.core.store import get_store
from app.models.schemas import JobOut, SourceInfo

router = APIRouter(tags=["jobs"])


def _to_job_out(job_id: str, data: dict) -> JobOut:
    sources = [
        SourceInfo(
            site=s["site"],
            originalId=s["originalId"],
            url=s["url"],
            postedAt=s.get("postedAt"),
        )
        for s in (data.get("sources") or [])
    ]
    return JobOut(
        id=job_id,
        status=data.get("status", "pending"),
        title=data.get("title", ""),
        companyNameRaw=data.get("companyNameRaw", ""),
        companyId=data.get("companyId"),
        keywords=data.get("keywords") or [],
        sources=sources,
        description=data.get("description"),
        createdAt=data.get("createdAt"),
        enrichedAt=data.get("enrichedAt"),
    )


@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str, uid: str = Depends(get_current_uid)):
    store = get_store()
    # Ensure the user has this scrap
    scrap = store.get_scrap(uid, job_id)
    if scrap is None:
        raise HTTPException(status_code=404, detail="Job not found in your scraps")
    job = store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _to_job_out(job_id, job)
