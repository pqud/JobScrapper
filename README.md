# JobScrap

A **Chrome extension** that scrapes job posting detail pages and shows which skills companies ask for, grouped by tech stack. You need your own **API key** (OpenAI or Anthropic).

채용 공고 상세 페이지를 수집하여 기술 스택별로 회사가 요구하는 항목이 무엇인지 확인하는 **Chrome 확장**입니다. **개인 API 키**(OpenAI, Anthropic)가 필요합니다.

---

## How to use (download → add to Chrome)

## 사용 방법 (다운로드 → Chrome에 추가)

### 1. Get this repository

### 1. 이 저장소 받기

- **ZIP:** GitHub → Code → **Download ZIP** → unzip  
  **ZIP:** GitHub 페이지 → Code → **Download ZIP** → 압축 해제
- Or `git clone` and open the folder  
  또는 `git clone` 후 해당 폴더로 이동

### 2. Build (once / after code changes)

### 2. 빌드 (처음 한 번 / 코드 수정 후)

Requires Node.js 18+.

Node.js 18+ 가 필요합니다.

```bash
cd extension
npm install
npm run build
```

This creates `extension/dist`.  
Skip this step if `extension/dist` is already included.

빌드가 끝나면 `extension/dist` 폴더가 생깁니다.  
(이미 `extension/dist` 가 포함돼 있다면 이 단계는 건너뛰어도 됩니다.)

### 3. Load the extension in Chrome

### 3. Chrome에 확장 로드

1. Open `chrome://extensions`  
   Chrome 주소창에 `chrome://extensions` 입력
2. Turn on **Developer mode** (top right)  
   오른쪽 위 **개발자 모드** 켜기
3. Click **Load unpacked**  
   **압축해제된 확장 프로그램을 로드합니다**
4. Select the `extension/dist` folder  
   `extension/dist` 폴더를 선택

### 4. Set your API key

### 4. API 키 설정

1. Click the JobScrap icon in the toolbar  
   툴바에서 JobScrap 아이콘 클릭
2. Choose OpenAI or Anthropic and enter your **API Key** (saved immediately)  
   OpenAI 또는 Anthropic 선택 후 **API Key** 입력 (입력 즉시 저장)
3. Keep **Structure with AI** checked  
   **AI로 구조화** 체크가 켜져 있는지 확인

### 5. Collect a posting

### 5. 공고 수집

1. Open a job **detail** page (e.g. JobKorea `GI_Read`, Wanted `/wd/...`)  
   채용 **상세** 페이지를 연다 (예: 잡코리아 `GI_Read`, 원티드 `/wd/...`)
2. Extension popup → **Collect current tab**  
   확장 팝업 → **현재 탭 수집**
3. Wait until it finishes (the button stays disabled while collecting)  
   수집이 끝날 때까지 기다린다 (수집 중에는 버튼이 비활성화됨)

### 6. Open the skill map

### 6. 기술 지도 보기

In the popup, open the dashboard (**Open map** / 지도 열기).

팝업에서 대시보드(지도) 링크를 열면 JobScrap 지도가 표시됩니다.

- Job table / skill matrix / cards  
  공고 표 / 기술 매트릭스 / 카드
- **Misc** tab: AI token usage & estimated cost  
  **기타** 탭: AI 토큰·추정 비용

---

## For developers

## 개발자용

```bash
cd extension
npm install
npm run build      # build dist / dist 생성
npm run typecheck  # typecheck only / 타입만 검사
```

| Path | Role |
| --- | --- |
| `extension/src/` | Extension source (popup, background, dashboard, content script) / 확장 소스 |
| `extension/dist/` | Built package loaded by Chrome / Chrome에 로드하는 빌드 결과물 |
| `extension/src/lib/sites.ts` | Allowed sites & detail URL patterns / 허용 사이트·상세 URL 패턴 |
| `extension/src/lib/ai.ts` | AI structuring (compact JSON schema) / AI 구조화 |

After editing code, run `npm run build`, then hit **Reload** on `chrome://extensions`.

코드를 수정한 뒤에는 `npm run build` 후 `chrome://extensions`에서 확장 **새로고침**을 누르면 반영됩니다.

---

## Notes

## 참고

- API costs are billed to **your** API key. The Misc tab costs are **estimates** from public pricing.  
  API 호출 비용은 **사용자 API 키**로 청구됩니다. 기타 탭의 비용은 공개 단가 기준 **추정**입니다.
