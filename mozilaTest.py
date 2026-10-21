"""본문만 뽑는 테스트. newspaper가 아니라 readability-lxml (arc90/Mozilla Readability 계열).

HTTP로 받은 HTML만 본다. JS로 나중에 붙는 iframe·sticky 영역은 여기 없다.
"""
import sys

sys.stdout.reconfigure(encoding="utf-8")

import requests
from lxml import html
from readability import Document

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def test_readability(target_url: str) -> None:
    print(f"[*] 대상 URL 분석 시작: {target_url}\n")
    res = requests.get(target_url, headers={"User-Agent": UA}, timeout=25)
    res.raise_for_status()
    # apparent_encoding은 잡코리아 utf-8을 Windows-1254로 오인한다. 헤더 charset을 쓴다.

    doc = Document(res.text)
    title = doc.short_title() or doc.title()
    text = html.fromstring(doc.summary()).text_content()
    text = "\n".join(line.strip() for line in text.splitlines() if line.strip())

    print("=" * 50)
    print(f"[제목]: {title}")
    print("=" * 50)
    print("\n[추출된 본문]:")
    print(text[:1000])
    print("..." if len(text) > 1000 else "")
    print("\n" + "=" * 50)
    print(f"전체 추출된 글자 수: {len(text)}자")
    print(f"HTTP {res.status_code} / encoding {res.encoding} / html {len(res.text)}자")


if __name__ == "__main__":
    sample_url = (
        sys.argv[1]
        if len(sys.argv) > 1
        else "https://www.jobkorea.co.kr/Recruit/GI_Read/50046281?Oem_Code=C1&sc=427"
    )
    try:
        test_readability(sample_url)
    except Exception as e:
        print(f"[-] 파싱 중 오류 발생: {type(e).__name__}: {e}")
