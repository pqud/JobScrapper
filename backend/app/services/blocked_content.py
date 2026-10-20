"""Detect anti-bot / copy-protection shells that are not real job content."""

BLOCK_MARKERS = [
    "복사가 허용되지 않습니다",
    "본문 바로가기",
    "주소가 복사되었습니다",
    "보안 설정에 따라",
    "captcha",
    "access denied",
    "just a moment",
]


def looks_blocked(text: str) -> bool:
    if not text:
        return False
    lower = text.lower()
    # Short pages that are mostly chrome UI noise
    hits = sum(1 for m in BLOCK_MARKERS if m.lower() in lower)
    if hits >= 2:
        return True
    if "복사가 허용되지 않습니다" in text and len(text) < 2000:
        return True
    return False
