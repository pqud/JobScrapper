import httpx
from bs4 import BeautifulSoup

from app.adapters.base import DetailAdapter, JobDetail, RateLimitedError
from app.core.config import get_settings


def parse_gamejob_detail_html(html: str) -> JobDetail:
    soup = BeautifulSoup(html, "lxml")
    title_el = soup.select_one("h1") or soup.select_one(".title") or soup.select_one("title")
    company_el = soup.select_one(".company") or soup.select_one("[class*='company']")
    desc_el = soup.select_one(".content") or soup.select_one("article") or soup.select_one("main")

    title = title_el.get_text(" ", strip=True) if title_el else "제목 없음"
    company = company_el.get_text(" ", strip=True) if company_el else ""
    description = desc_el.get_text("\n", strip=True) if desc_el else soup.get_text("\n", strip=True)[:8000]
    return JobDetail(title=title, company_name=company, description=description)


class GamejobDetailAdapter(DetailAdapter):
    async def fetch_detail(self, url: str) -> JobDetail:
        settings = get_settings()
        headers = {"User-Agent": settings.bot_user_agent}
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            res = await client.get(url, headers=headers)
        if res.status_code == 429:
            raise RateLimitedError()
        res.raise_for_status()
        return parse_gamejob_detail_html(res.text)
