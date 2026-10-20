import json
import re

import httpx
from bs4 import BeautifulSoup

from app.adapters.base import DetailAdapter, JobDetail, RateLimitedError
from app.core.config import get_settings
from app.services.blocked_content import looks_blocked


class BlockedContentError(Exception):
    """Site returned a copy-protection / anti-bot shell instead of the posting."""


def parse_jobkorea_detail_html(html: str) -> JobDetail:
    soup = BeautifulSoup(html, "lxml")

    # Next.js payload often has the real content
    next_data = soup.select_one("script#__NEXT_DATA__")
    if next_data and next_data.string:
        try:
            payload = json.loads(next_data.string)
            extracted = _from_next_data(payload)
            if extracted and len(extracted.description) > 40:
                return extracted
        except Exception:
            pass

    title_el = (
        soup.select_one("h1")
        or soup.select_one(".ttl")
        or soup.select_one(".hd-heading")
        or soup.select_one('meta[property="og:title"]')
        or soup.select_one("title")
    )
    company_el = (
        soup.select_one(".coName")
        or soup.select_one(".company")
        or soup.select_one(".corp-name")
        or soup.select_one("[class*='company']")
        or soup.select_one('meta[property="og:site_name"]')
    )
    desc_el = (
        soup.select_one("#job-detail")
        or soup.select_one(".tbDetail")
        or soup.select_one(".detail-content")
        or soup.select_one("article")
        or soup.select_one("main")
    )

    if title_el and title_el.name == "meta":
        title = title_el.get("content") or ""
    else:
        title = title_el.get_text(" ", strip=True) if title_el else ""
    title = re.sub(r"\s*\|.*$", "", title).strip()

    if company_el and company_el.name == "meta":
        company = company_el.get("content") or ""
    else:
        company = company_el.get_text(" ", strip=True) if company_el else ""

    description = (
        desc_el.get_text("\n", strip=True) if desc_el else soup.get_text("\n", strip=True)[:8000]
    )

    detail = JobDetail(
        title=title or "제목 없음",
        company_name=company,
        description=description,
    )
    if looks_blocked(description) or looks_blocked(html[:3000]):
        raise BlockedContentError("JobKorea returned a blocked/security shell page")
    return detail


def _from_next_data(payload: dict) -> JobDetail | None:
    """Best-effort walk of Next.js JSON for title/company/description strings."""
    blobs: list[str] = []
    title = ""
    company = ""

    def walk(node, depth=0):
        nonlocal title, company
        if depth > 12:
            return
        if isinstance(node, dict):
            for k, v in node.items():
                key = str(k).lower()
                if isinstance(v, str):
                    if not title and key in ("title", "jobtitle", "postingtitle", "name") and 2 < len(v) < 120:
                        title = v
                    if not company and key in ("companyname", "corpname", "company") and 1 < len(v) < 80:
                        company = v
                    if len(v) > 80:
                        blobs.append(v)
                else:
                    walk(v, depth + 1)
        elif isinstance(node, list):
            for item in node[:50]:
                walk(item, depth + 1)

    walk(payload)
    description = "\n".join(blobs[:30])[:12000]
    if not title and not description:
        return None
    return JobDetail(title=title or "제목 없음", company_name=company, description=description)


class JobkoreaDetailAdapter(DetailAdapter):
    async def fetch_detail(self, url: str) -> JobDetail:
        settings = get_settings()
        headers = {
            "User-Agent": settings.bot_user_agent,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
        }
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            res = await client.get(url, headers=headers)
        if res.status_code == 429:
            raise RateLimitedError()
        res.raise_for_status()
        return parse_jobkorea_detail_html(res.text)
