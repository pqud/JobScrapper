# JobScrap

채용 공고 상세 페이지를 수집하고, **본인 API 키**로 AI 구조화한 뒤 기술 지도(대시보드)로 보는 **Chrome 확장**입니다.

- 페이지 텍스트가 충분하면 → 텍스트만 AI에 전달 (비전 비용 없음)
- 이미지 공고면 → 공고 JPG를 AI vision으로 구조화
- 결과는 확장 로컬 스토리지에 저장 (별도 서버 불필요)

---

## 사용 방법 (다운로드 → Chrome에 추가)

### 1. 이 저장소 받기

- **ZIP:** GitHub 페이지 → Code → **Download ZIP** → 압축 해제  
- 또는 `git clone` 후 해당 폴더로 이동

### 2. 빌드 (처음 한 번 / 코드 수정 후)

Node.js 18+ 가 필요합니다.

```bash
cd extension
npm install
npm run build
```

빌드가 끝나면 `extension/dist` 폴더가 생깁니다.  
(이미 `extension/dist` 가 포함돼 있다면 이 단계는 건너뛰어도 됩니다.)

### 3. Chrome에 확장 로드

1. Chrome 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램을 로드합니다**
4. `extension/dist` 폴더를 선택

### 4. API 키 설정

1. 툴바에서 JobScrap 아이콘 클릭
2. OpenAI 또는 Anthropic 선택 후 **API Key** 입력 (입력 즉시 저장)
3. AI 구조화 사용 체크가 켜져 있는지 확인

### 5. 공고 수집

1. 채용 **상세** 페이지를 연다 (예: 잡코리아 `GI_Read`, 원티드 `/wd/...`)
2. 확장 팝업 → **현재 탭 수집**
3. 수집이 끝날 때까지 버튼을 다시 누르지 않는다 (수집 중에는 비활성화됨)

여러 URL을 한 번에 넣을 때는 팝업 텍스트 칸에 줄마다 URL을 붙여 넣고 **링크 가져오기**를 누른다.

### 6. 기술 지도 보기

팝업에서 대시보드(지도) 링크를 열면 JobScrap 지도가 표시됩니다.

- 공고 표 / 기술 매트릭스 / 카드
- **기타** 탭: AI 토큰·추정 비용

---

## 개발자용

```bash
cd extension
npm install
npm run build      # dist 생성
npm run typecheck  # 타입만 검사
```

소스 구조:

| 경로 | 역할 |
| --- | --- |
| `extension/src/` | 확장 소스 (popup, background, dashboard, content script) |
| `extension/dist/` | Chrome에 로드하는 빌드 결과물 |
| `extension/src/lib/sites.ts` | 허용 사이트·상세 URL 패턴 |
| `extension/src/lib/ai.ts` | AI 구조화 (compact JSON 스키마) |

코드를 수정한 뒤에는 `npm run build` 후 `chrome://extensions`에서 확장 **새로고침**을 누르면 반영됩니다.

---

## 참고

- API 호출 비용은 **사용자 API 키**로 청구됩니다. 기타 탭의 비용은 공개 단가 기준 **추정**입니다.
- `backend/`, `frontend/` 폴더는 예전 서버 동기화용 코드이며, 현재 확장 단독 사용에는 필요하지 않습니다.
- Electron 데스크톱 앱은 제거되었습니다.
