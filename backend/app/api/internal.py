from fastapi import APIRouter, HTTPException

from app.models.schemas import EnrichRequest
from app.services.enrichment_worker import CircuitOpenError, process_enrichment
from app.adapters import RateLimitedError

router = APIRouter(tags=["internal"])


@router.post("/internal/enrich")
async def enrich_job(payload: EnrichRequest):
    try:
        await process_enrichment(payload.job_id, payload.site, payload.url)
    except CircuitOpenError:
        raise HTTPException(status_code=503, detail="circuit open")
    except RateLimitedError:
        raise HTTPException(status_code=503, detail="rate limited, circuit opened")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"ok": True}
