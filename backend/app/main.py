import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import insights, internal, jobs, scraps, sync, users
from app.core.config import get_settings
from app.core.firebase import init_firebase

logging.basicConfig(level=logging.INFO)
settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["chrome-extension://*"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sync.router)
app.include_router(jobs.router)
app.include_router(scraps.router)
app.include_router(insights.router)
app.include_router(internal.router)
app.include_router(users.router)


@app.on_event("startup")
async def on_startup() -> None:
    init_firebase()
    from app.services.enrichment_worker import ensure_local_workers, requeue_all_pending

    if not settings.use_cloud_tasks:
        await ensure_local_workers()
        n = await requeue_all_pending()
        logging.getLogger(__name__).info("Re-queued %s pending enrichments on startup", n)


@app.get("/health")
async def health():
    return {"status": "ok", "auth_dev_mode": settings.auth_dev_mode}


@app.post("/internal/requeue-pending")
async def requeue_pending():
    from app.services.enrichment_worker import requeue_all_pending

    n = await requeue_all_pending()
    return {"requeued": n}
