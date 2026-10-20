from abc import ABC, abstractmethod
from dataclasses import dataclass, field


class RateLimitedError(Exception):
    """Raised when a site returns 429 or equivalent."""


@dataclass
class JobDetail:
    title: str
    company_name: str
    description: str
    posted_at: str | None = None
    location: str | None = None
    employment_type: str | None = None
    extra: dict = field(default_factory=dict)


class DetailAdapter(ABC):
    @abstractmethod
    async def fetch_detail(self, url: str) -> JobDetail: ...
