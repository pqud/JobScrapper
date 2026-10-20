from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Site = Literal["jobkorea", "wanted", "jobplanet", "gamejob"]
JobStatus = Literal["pending", "enriched", "failed"]


class RawScrapItem(BaseModel):
    site: Site
    originalId: str
    url: str
    title: str
    companyName: str
    scrapedAt: str


class SyncScrapsRequest(BaseModel):
    items: list[RawScrapItem]


class SyncScrapsResponse(BaseModel):
    synced: int
    pending_enrichment: int


class SourceInfo(BaseModel):
    site: Site
    originalId: str
    url: str
    postedAt: str | None = None


class JobOut(BaseModel):
    id: str
    status: JobStatus
    title: str
    companyNameRaw: str
    companyId: str | None = None
    keywords: list[str] = Field(default_factory=list)
    sources: list[SourceInfo] = Field(default_factory=list)
    description: str | None = None
    createdAt: datetime | None = None
    enrichedAt: datetime | None = None


class ScrapItemOut(BaseModel):
    jobId: str
    scrapedAt: str | None = None
    job: JobOut | None = None


class ScrapListResponse(BaseModel):
    items: list[ScrapItemOut]
    pending_enrichment: int
    last_synced_at: str | None = None


class KeywordCount(BaseModel):
    keyword: str
    count: int


class InsightsResponse(BaseModel):
    keywords: list[KeywordCount]
    pending_count: int
    enriched_count: int


class EnrichRequest(BaseModel):
    job_id: str
    site: Site
    url: str


class BrowserJobDetail(BaseModel):
    site: Site
    originalId: str
    url: str
    title: str = ""
    companyName: str = ""
    description: str = ""
    postedAt: str | None = None


class SyncDetailsRequest(BaseModel):
    items: list[BrowserJobDetail]


class SyncDetailsResponse(BaseModel):
    updated: int
    blocked: int


class PendingEnrichItem(BaseModel):
    jobId: str
    site: Site
    originalId: str
    url: str
    title: str = ""


class PendingEnrichResponse(BaseModel):
    items: list[PendingEnrichItem]
