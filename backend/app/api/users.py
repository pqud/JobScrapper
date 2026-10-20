from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.auth import get_current_uid
from app.core.store import get_store

router = APIRouter(tags=["users"])


class ConnectExtensionRequest(BaseModel):
    email: str | None = None
    displayName: str | None = None


@router.post("/users/me/extension-connected")
async def mark_extension_connected(
    payload: ConnectExtensionRequest,
    uid: str = Depends(get_current_uid),
):
    store = get_store()
    store.set_user(
        uid,
        {
            "email": payload.email,
            "displayName": payload.displayName,
            "extensionConnectedAt": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )
    return {"connected": True}
