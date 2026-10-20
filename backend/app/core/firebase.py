from __future__ import annotations

import logging

import firebase_admin
from firebase_admin import credentials

from app.core.config import get_settings

logger = logging.getLogger(__name__)
_initialized = False


def init_firebase() -> None:
    global _initialized
    if _initialized or firebase_admin._apps:
        _initialized = True
        return

    settings = get_settings()
    if settings.auth_dev_mode and not settings.google_application_credentials:
        # Minimal app for local without credentials; token verify uses auth_dev_mode
        firebase_admin.initialize_app(options={"projectId": settings.firebase_project_id or "jobscrap-dev"})
        _initialized = True
        logger.info("Firebase initialized in dev mode (no credentials file)")
        return

    if settings.google_application_credentials:
        cred = credentials.Certificate(settings.google_application_credentials)
        firebase_admin.initialize_app(cred, {"projectId": settings.firebase_project_id or None})
    else:
        firebase_admin.initialize_app()
    _initialized = True
