from datetime import datetime, timedelta, timezone

from app.core.store import get_store


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        dt = datetime.fromisoformat(value)
    else:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


async def is_circuit_open(site: str) -> bool:
    store = get_store()
    doc = store.get_circuit(site)
    if not doc:
        return False
    open_until = _parse_dt(doc.get("open_until"))
    if open_until is None:
        return False
    return open_until > _now()


async def open_circuit(site: str, cooldown_minutes: int = 30) -> None:
    store = get_store()
    existing = store.get_circuit(site) or {}
    store.set_circuit(
        site,
        {
            **existing,
            "open_until": (_now() + timedelta(minutes=cooldown_minutes)).isoformat(),
        },
    )


async def record_failure(site: str) -> None:
    store = get_store()
    doc = store.get_circuit(site) or {}
    failures = int(doc.get("recent_failures", 0)) + 1
    payload = {**doc, "recent_failures": failures}
    if failures >= 5:
        payload["open_until"] = (_now() + timedelta(minutes=15)).isoformat()
        payload["recent_failures"] = 0
    store.set_circuit(site, payload)


async def record_success(site: str) -> None:
    store = get_store()
    doc = store.get_circuit(site) or {}
    store.set_circuit(site, {**doc, "recent_failures": 0})
