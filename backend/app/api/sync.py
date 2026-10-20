from fastapi import APIRouter, Depends

from app.core.auth import get_current_uid
from app.models.schemas import (
    PendingEnrichItem,
    PendingEnrichResponse,
    SyncDetailsRequest,
    SyncDetailsResponse,
    SyncScrapsRequest,
    SyncScrapsResponse,
)
from app.services.detail_ingest import ingest_browser_details, list_pending_enrichment
from app.services.normalizer import upsert_scrap_batch

router = APIRouter(tags=["sync"])


@router.post("/sync/scraps", response_model=SyncScrapsResponse)
async def sync_scraps(
    payload: SyncScrapsRequest,
    uid: str = Depends(get_current_uid),
):
    result = await upsert_scrap_batch(uid, payload.items)
    return SyncScrapsResponse(
        synced=result.synced_count,
        pending_enrichment=result.pending_count,
    )


@router.post("/sync/details", response_model=SyncDetailsResponse)
async def sync_details(
    payload: SyncDetailsRequest,
    uid: str = Depends(get_current_uid),
):
    """Receive job details scraped in the user's browser (preferred for JobKorea)."""
    result = await ingest_browser_details(uid, payload.items)
    return SyncDetailsResponse(updated=result.updated, blocked=result.blocked)


@router.get("/enrichment/pending", response_model=PendingEnrichResponse)
async def pending_enrichment(uid: str = Depends(get_current_uid)):
    items = [
        PendingEnrichItem(**row) for row in list_pending_enrichment(uid)
    ]
    return PendingEnrichResponse(items=items)
