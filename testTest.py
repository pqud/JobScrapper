"""잡코리아 상세 공고 — Playwright로 article / image 이중 포맷 파싱."""

from __future__ import annotations

import time

from playwright.sync_api import Frame, Page, sync_playwright


def _is_junk_image(src: str, alt: str = "") -> bool:
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


def _collect_web_images(frame: Frame | Page) -> list[tuple[str, str]]:
    """p.web / .web 안의 공고 이미지 수집."""
    results: list[tuple[str, str]] = []
    seen: set[str] = set()

    for root in frame.query_selector_all("p.web, .web"):
        for img in root.query_selector_all("img"):
            src = (img.get_attribute("src") or img.get_attribute("data-src") or "").strip()
            alt = (img.get_attribute("alt") or "").strip()
            if not src or src in seen or _is_junk_image(src, alt):
                continue
            seen.add(src)
            results.append((src, alt))
    return results


def _search_images_in_frames(page: Page) -> list[tuple[str, str]]:
    """상위 → iframe → 중첩 iframe 순으로 p.web 이미지 탐색."""
    found = _collect_web_images(page)
    if found:
        return found

    frames = page.query_selector_all("iframe")
    # 공고 본문 iframe 우선
    frames.sort(
        key=lambda f: (
            0 if "GI_Read_Comt_Ifrm" in ((f.get_attribute("src") or "")) else 1
        )
    )

    for frame_el in frames:
        content = frame_el.content_frame()
        if content is None:
            continue

        found = _collect_web_images(content)
        if found:
            return found

        for nested_el in content.query_selector_all("iframe"):
            nested = nested_el.content_frame()
            if nested is None:
                continue
            found = _collect_web_images(nested)
            if found:
                return found

    return []


def try_parse_image(page: Page) -> list[tuple[str, str]]:
    deadline = time.time() + 12
    while time.time() < deadline:
        urls = _search_images_in_frames(page)
        if urls:
            return urls
        time.sleep(0.4)
    return []


def try_parse_article(page: Page) -> list[str]:
    """ul.detail-section li.detail-article (상위 또는 iframe)."""
    deadline = time.time() + 12
    while time.time() < deadline:
        contexts: list[Frame | Page] = [page]
        for frame_el in page.query_selector_all("iframe"):
            f = frame_el.content_frame()
            if f is not None:
                contexts.append(f)

        for ctx in contexts:
            items = ctx.query_selector_all(
                "ul.detail-section li.detail-article, li.detail-article"
            )
            if items:
                return [(item.text_content() or "").strip() for item in items if (item.text_content() or "").strip()]
        time.sleep(0.4)
    return []


def main() -> None:
    url = input("URL: ")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(url, wait_until="domcontentloaded")

        articles = try_parse_article(page)
        if articles:
            print("format: article")
            for text in articles:
                print(text)
                print("---")
        else:
            images = try_parse_image(page)
            if images:
                print("format: image")
                print("images:", len(images))
                for src, alt in images:
                    print(" -", alt or "(no alt)")
                    print("  ", src)
            else:
                print("No items found")

        try:
            input("\n엔터 치면 종료...")
        except EOFError:
            pass
        browser.close()


if __name__ == "__main__":
    main()
