"""Storage abstraction: in-memory for local dev, Firestore for production."""

from __future__ import annotations

import copy
import hashlib
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from app.core.config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def make_job_key(site: str, original_id: str) -> str:
    raw = f"{site}:{original_id}".encode()
    return hashlib.sha256(raw).hexdigest()[:24]


def company_key(name: str) -> str:
    normalized = "".join(ch.lower() for ch in name if ch.isalnum())
    return hashlib.sha256(normalized.encode()).hexdigest()[:16] if normalized else "unknown"


class MemoryStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self.jobs: dict[str, dict[str, Any]] = {}
        self.companies: dict[str, dict[str, Any]] = {}
        self.scraps: dict[str, dict[str, dict[str, Any]]] = {}  # uid -> jobId -> data
        self.circuit_breakers: dict[str, dict[str, Any]] = {}
        self.users: dict[str, dict[str, Any]] = {}
        self.meta: dict[str, dict[str, Any]] = {}  # uid -> {last_synced_at}

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            doc = self.jobs.get(job_id)
            return copy.deepcopy(doc) if doc else None

    def set_job(self, job_id: str, data: dict[str, Any], merge: bool = False) -> None:
        with self._lock:
            if merge and job_id in self.jobs:
                self.jobs[job_id] = {**self.jobs[job_id], **copy.deepcopy(data)}
            else:
                self.jobs[job_id] = copy.deepcopy(data)

    def update_job(self, job_id: str, data: dict[str, Any]) -> None:
        self.set_job(job_id, data, merge=True)

    def get_company(self, company_id: str) -> dict[str, Any] | None:
        with self._lock:
            doc = self.companies.get(company_id)
            return copy.deepcopy(doc) if doc else None

    def set_company(self, company_id: str, data: dict[str, Any]) -> None:
        with self._lock:
            self.companies[company_id] = copy.deepcopy(data)

    def get_scrap(self, uid: str, job_id: str) -> dict[str, Any] | None:
        with self._lock:
            doc = self.scraps.get(uid, {}).get(job_id)
            return copy.deepcopy(doc) if doc else None

    def set_scrap(self, uid: str, job_id: str, data: dict[str, Any], merge: bool = True) -> None:
        with self._lock:
            self.scraps.setdefault(uid, {})
            if merge and job_id in self.scraps[uid]:
                self.scraps[uid][job_id] = {**self.scraps[uid][job_id], **copy.deepcopy(data)}
            else:
                self.scraps[uid][job_id] = copy.deepcopy(data)

    def list_scraps(self, uid: str) -> list[tuple[str, dict[str, Any]]]:
        with self._lock:
            items = self.scraps.get(uid, {})
            return [(jid, copy.deepcopy(data)) for jid, data in items.items()]

    def delete_scrap(self, uid: str, job_id: str) -> bool:
        with self._lock:
            if uid in self.scraps and job_id in self.scraps[uid]:
                del self.scraps[uid][job_id]
                return True
            return False

    def get_circuit(self, site: str) -> dict[str, Any] | None:
        with self._lock:
            doc = self.circuit_breakers.get(site)
            return copy.deepcopy(doc) if doc else None

    def set_circuit(self, site: str, data: dict[str, Any]) -> None:
        with self._lock:
            self.circuit_breakers[site] = copy.deepcopy(data)

    def set_user(self, uid: str, data: dict[str, Any], merge: bool = True) -> None:
        with self._lock:
            if merge and uid in self.users:
                self.users[uid] = {**self.users[uid], **copy.deepcopy(data)}
            else:
                self.users[uid] = copy.deepcopy(data)

    def set_last_synced(self, uid: str, when: datetime) -> None:
        with self._lock:
            self.meta.setdefault(uid, {})
            self.meta[uid]["last_synced_at"] = when.isoformat()

    def get_last_synced(self, uid: str) -> str | None:
        with self._lock:
            return self.meta.get(uid, {}).get("last_synced_at")


class FirestoreStore:
    """Thin wrapper around google.cloud.firestore for the same interface."""

    def __init__(self) -> None:
        from google.cloud import firestore

        self.db = firestore.Client()

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("jobs").document(job_id).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        data["id"] = job_id
        return data

    def set_job(self, job_id: str, data: dict[str, Any], merge: bool = False) -> None:
        self.db.collection("jobs").document(job_id).set(data, merge=merge)

    def update_job(self, job_id: str, data: dict[str, Any]) -> None:
        self.db.collection("jobs").document(job_id).set(data, merge=True)

    def get_company(self, company_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("companies").document(company_id).get()
        return doc.to_dict() if doc.exists else None

    def set_company(self, company_id: str, data: dict[str, Any]) -> None:
        self.db.collection("companies").document(company_id).set(data, merge=True)

    def get_scrap(self, uid: str, job_id: str) -> dict[str, Any] | None:
        doc = self.db.collection("scraps").document(uid).collection("items").document(job_id).get()
        return doc.to_dict() if doc.exists else None

    def set_scrap(self, uid: str, job_id: str, data: dict[str, Any], merge: bool = True) -> None:
        self.db.collection("scraps").document(uid).collection("items").document(job_id).set(
            data, merge=merge
        )

    def list_scraps(self, uid: str) -> list[tuple[str, dict[str, Any]]]:
        docs = self.db.collection("scraps").document(uid).collection("items").stream()
        return [(d.id, d.to_dict() or {}) for d in docs]

    def delete_scrap(self, uid: str, job_id: str) -> bool:
        ref = self.db.collection("scraps").document(uid).collection("items").document(job_id)
        if not ref.get().exists:
            return False
        ref.delete()
        return True

    def get_circuit(self, site: str) -> dict[str, Any] | None:
        doc = self.db.collection("circuit_breakers").document(site).get()
        return doc.to_dict() if doc.exists else None

    def set_circuit(self, site: str, data: dict[str, Any]) -> None:
        self.db.collection("circuit_breakers").document(site).set(data)

    def set_user(self, uid: str, data: dict[str, Any], merge: bool = True) -> None:
        self.db.collection("users").document(uid).set(data, merge=merge)

    def set_last_synced(self, uid: str, when: datetime) -> None:
        self.db.collection("users").document(uid).set(
            {"lastSyncedAt": when.isoformat()}, merge=True
        )

    def get_last_synced(self, uid: str) -> str | None:
        doc = self.db.collection("users").document(uid).get()
        if not doc.exists:
            return None
        data = doc.to_dict() or {}
        return data.get("lastSyncedAt")


_store: MemoryStore | FirestoreStore | None = None


def get_store() -> MemoryStore | FirestoreStore:
    global _store
    if _store is None:
        settings = get_settings()
        if settings.use_memory_store:
            _store = MemoryStore()
        else:
            _store = FirestoreStore()
    return _store
