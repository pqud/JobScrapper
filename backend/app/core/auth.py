from fastapi import Header, HTTPException

from app.core.config import get_settings


async def get_current_uid(authorization: str = Header(...)) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid auth header")

    token = authorization.removeprefix("Bearer ").strip()
    settings = get_settings()

    if settings.auth_dev_mode:
        # Dev tokens: "demo:<uid>" or any non-empty string maps to that uid / "dev-user"
        if token.startswith("demo:"):
            uid = token.removeprefix("demo:").strip()
            if not uid:
                raise HTTPException(status_code=401, detail="Invalid demo token")
            return uid
        if token:
            return "dev-user"

    try:
        from firebase_admin import auth as firebase_auth

        decoded = firebase_auth.verify_id_token(token)
        return decoded["uid"]
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from exc
