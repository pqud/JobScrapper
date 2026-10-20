"""
잡코리아 상세 공고 이중 포맷 파서 (Selenium)

판별:
  1) .view-content-detail 이 있고 본문 텍스트가 있으면 → article
  2) 아니면 iframe/p.web 의 실제 공고 이미지만 → image
  (로고/광고/원픽 썸네일은 image로 치지 않음)
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


@dataclass
class ArticleSection:
    title: str
    lines: list[str] = field(default_factory=list)


@dataclass
class JobParseResult:
    format: str  # "image" | "article" | "unknown"
    title: str = ""
    company: str = ""
    description: str = ""
    image_urls: list[str] = field(default_factory=list)
    image_alts: list[str] = field(default_factory=list)
    sections: list[ArticleSection] = field(default_factory=list)


def _page_meta(driver: WebDriver) -> tuple[str, str]:
    title = ""
    for sel in ("h1", ".ttl", ".hd-heading", ".tit"):
        els = driver.find_elements(By.CSS_SELECTOR, sel)
        if els and els[0].text.strip():
            title = els[0].text.strip()
            break
    if not title:
        title = driver.title.split("|")[0].strip()

    company = ""
    for sel in (".coName", ".company", ".corp-name", "[class*='company'] a"):
        els = driver.find_elements(By.CSS_SELECTOR, sel)
        if els and els[0].text.strip():
            company = els[0].text.strip()
            break
    return title, company


def _is_junk_image(src: str, alt: str = "") -> bool:
    """페이지 공통 로고/광고만 제외. p.web 안 공고 이미지는 건드리지 않음."""
    s = (src or "").lower()
    a = (alt or "").lower()
    if not s or s.startswith("data:"):
        return True
    deny = (
        "logoimage",
        "ads.jobkorea.co.kr",
        "onepick-title-image",
        "favicon",
        "sprite",
        "/img/icon",
        "blank.gif",
        "spacer.gif",
    )
    return any(d in s or d in a for d in deny)


def _collect_web_images(driver: WebDriver) -> tuple[list[str], list[str]]:
    """
    이미지 공고 본문: p.web / .web 안의 img.
    컨테이너가 공고 영역이므로 CDN allowlist로 막지 않는다.
    """
    urls: list[str] = []
    alts: list[str] = []
    seen: set[str] = set()

    webs = driver.find_elements(By.CSS_SELECTOR, "p.web, .web")
    for root in webs:
        for img in root.find_elements(By.TAG_NAME, "img"):
            src = (img.get_attribute("src") or img.get_attribute("data-src") or "").strip()
            alt = (img.get_attribute("alt") or "").strip()
            if not src or src in seen or _is_junk_image(src, alt):
                continue
            seen.add(src)
            urls.append(src)
            alts.append(alt)
    return urls, alts


def _search_images_in_frames(driver: WebDriver) -> tuple[list[str], list[str]]:
    """상위 → iframe → 중첩 iframe 순으로 p.web 이미지 탐색."""
    urls, alts = _collect_web_images(driver)
    if urls:
        return urls, alts

    frames = driver.find_elements(By.TAG_NAME, "iframe")
    # 공고 본문 iframe을 앞으로
    frames.sort(
        key=lambda f: (
            0
            if "GI_Read_Comt_Ifrm" in ((f.get_attribute("src") or ""))
            else 1
        )
    )

    for frame in frames:
        try:
            driver.switch_to.frame(frame)
        except Exception:
            continue

        urls, alts = _collect_web_images(driver)
        if urls:
            driver.switch_to.default_content()
            return urls, alts

        for nested in driver.find_elements(By.TAG_NAME, "iframe"):
            try:
                driver.switch_to.frame(nested)
                urls, alts = _collect_web_images(driver)
                driver.switch_to.parent_frame()
                if urls:
                    driver.switch_to.default_content()
                    return urls, alts
            except Exception:
                driver.switch_to.default_content()
                try:
                    driver.switch_to.frame(frame)
                except Exception:
                    break

        driver.switch_to.default_content()

    return [], []


def try_parse_image_format(driver: WebDriver) -> JobParseResult | None:
    title, company = _page_meta(driver)
    driver.switch_to.default_content()

    # iframe/p.web 이 늦게 뜨는 경우 재시도
    deadline = time.time() + 12
    urls: list[str] = []
    alts: list[str] = []
    while time.time() < deadline:
        urls, alts = _search_images_in_frames(driver)
        if urls:
            break
        time.sleep(0.4)

    if not urls:
        return None
    return _image_result(title, company, urls, alts)


def _image_result(
    title: str, company: str, urls: list[str], alts: list[str]
) -> JobParseResult:
    lines = ["[이미지 공고 — OCR 미적용]"]
    for src, alt in zip(urls, alts):
        lines.append(f"- alt: {alt or '(없음)'}")
        lines.append(f"  src: {src}")
    return JobParseResult(
        format="image",
        title=title,
        company=company,
        description="\n".join(lines),
        image_urls=urls,
        image_alts=alts,
    )


def _find_view_content_detail(driver: WebDriver):
    """상위 문서 + iframe에서 .view-content-detail 찾기. 찾으면 해당 컨텍스트에 머묾."""
    roots = driver.find_elements(By.CSS_SELECTOR, ".view-content-detail")
    if roots:
        return roots[0]

    for frame in driver.find_elements(By.TAG_NAME, "iframe"):
        try:
            driver.switch_to.frame(frame)
        except Exception:
            continue
        roots = driver.find_elements(By.CSS_SELECTOR, ".view-content-detail")
        if roots:
            return roots[0]
        driver.switch_to.default_content()

    driver.switch_to.default_content()
    return None


def try_parse_article_format(driver: WebDriver) -> JobParseResult | None:
    """2번: .view-content-detail > ul.detail-section > li.detail-article"""
    title, company = _page_meta(driver)
    driver.switch_to.default_content()

    # SPA라서 잠깐 대기
    deadline = time.time() + 12
    root = None
    while time.time() < deadline:
        root = _find_view_content_detail(driver)
        if root:
            articles = root.find_elements(By.CSS_SELECTOR, "ul.detail-section li.detail-article")
            if articles:
                break
            # detail-section 없이도 detail-article 이 있을 수 있음
            articles = root.find_elements(By.CSS_SELECTOR, "li.detail-article")
            if articles:
                break
        driver.switch_to.default_content()
        time.sleep(0.4)
        root = None

    if root is None:
        driver.switch_to.default_content()
        return None

    sections: list[ArticleSection] = []
    chunks: list[str] = []

    articles = root.find_elements(
        By.CSS_SELECTOR, "ul.detail-section > li.detail-article, li.detail-article"
    )
    for article in articles:
        h = article.find_elements(By.CSS_SELECTOR, "h3.title")
        sec_title = h[0].text.strip() if h else ""
        lines: list[str] = []

        for li in article.find_elements(By.CSS_SELECTOR, "ul.sentence > li"):
            t = (li.text or "").strip()
            if t:
                lines.append(t)

        if not lines:
            for p in article.find_elements(By.CSS_SELECTOR, "p.sentence"):
                t = (p.text or "").strip()
                if t:
                    lines.append(t)

        if not sec_title and not lines:
            continue

        sections.append(ArticleSection(title=sec_title, lines=lines))
        if sec_title:
            chunks.append(f"## {sec_title}")
        chunks.extend(lines)
        chunks.append("")

    driver.switch_to.default_content()

    description = "\n".join(chunks).strip()
    if not sections and len(description) < 20:
        return None

    return JobParseResult(
        format="article",
        title=title,
        company=company,
        description=description[:12000],
        sections=sections,
    )


def parse_jobkorea_detail(driver: WebDriver) -> JobParseResult:
    """
    article 텍스트(.view-content-detail)가 있으면 그걸 우선.
    없을 때만 이미지 공고로 분류.
    """
    article = try_parse_article_format(driver)
    if article is not None:
        return article

    image = try_parse_image_format(driver)
    if image is not None:
        return image

    title, company = _page_meta(driver)
    return JobParseResult(format="unknown", title=title, company=company)


def main() -> None:
    url = input("URL: ").strip()
    options = Options()
    # options.add_argument("--headless")
    options.add_argument("--disable-blink-features=AutomationControlled")
    driver = webdriver.Chrome(options=options)

    try:
        driver.get(url)
        WebDriverWait(driver, 15).until(
            EC.presence_of_element_located((By.TAG_NAME, "body"))
        )

        result = parse_jobkorea_detail(driver)
        print("format:", result.format)
        print("title:", result.title)
        print("company:", result.company)

        if result.format == "image":
            print("images:", len(result.image_urls))
            for src, alt in zip(result.image_urls[:5], result.image_alts[:5]):
                print(" -", alt or "(no alt)")
                print("  ", src)
            print("\n(모집요강 텍스트는 Tesseract 등 OCR로 image_urls를 후처리하면 됨)")
        elif result.format == "article":
            print("sections:", len(result.sections))
            print("--- description preview ---")
            print(result.description[:800])
            for sec in result.sections:
                print(f"\n## {sec.title}")
                for line in sec.lines:
                    print(" -", line)
        else:
            print("unknown — 두 포맷 모두 실패")
            driver.switch_to.default_content()
            print("has .view-content-detail?:", bool(driver.find_elements(By.CSS_SELECTOR, ".view-content-detail")))
            iframes = driver.find_elements(By.TAG_NAME, "iframe")
            print("iframe count:", len(iframes))
            for i, f in enumerate(iframes[:5]):
                print(f"  iframe[{i}]:", (f.get_attribute("src") or "")[:100])
                try:
                    driver.switch_to.frame(f)
                    webs = driver.find_elements(By.CSS_SELECTOR, "p.web, .web")
                    imgs = driver.find_elements(By.CSS_SELECTOR, "p.web img, .web img")
                    print(f"    .web={len(webs)} imgs_in_web={len(imgs)}")
                    driver.switch_to.default_content()
                except Exception as e:
                    print("    switch fail:", e)
                    driver.switch_to.default_content()
    finally:
        input("\n엔터 치면 종료...")
        driver.quit()


if __name__ == "__main__":
    main()
