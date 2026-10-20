from app.adapters.base import DetailAdapter, RateLimitedError
from app.adapters.gamejob_detail import GamejobDetailAdapter
from app.adapters.jobkorea_detail import JobkoreaDetailAdapter
from app.adapters.jobplanet_detail import JobplanetDetailAdapter
from app.adapters.wanted_detail import WantedDetailAdapter

_ADAPTERS: dict[str, DetailAdapter] = {
    "jobkorea": JobkoreaDetailAdapter(),
    "wanted": WantedDetailAdapter(),
    "jobplanet": JobplanetDetailAdapter(),
    "gamejob": GamejobDetailAdapter(),
}


def get_adapter(site: str) -> DetailAdapter:
    try:
        return _ADAPTERS[site]
    except KeyError as exc:
        raise ValueError(f"Unknown site: {site}") from exc


__all__ = ["get_adapter", "RateLimitedError", "DetailAdapter"]
