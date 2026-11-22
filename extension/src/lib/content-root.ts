/** DOM 없는 본문 루트 규칙. 콘텐츠 스크립트와 백그라운드가 같이 쓴다. */

export const SECTIONS: { name: string; hits: string[] }[] = [
  { name: "담당업무", hits: ["담당업무", "주요업무", "업무내용", "수행업무"] },
  { name: "자격요건", hits: ["자격요건", "지원자격"] },
  { name: "우대", hits: ["우대"] },
];

export function missingSections(text: string): string[] {
  return SECTIONS.filter((s) => !s.hits.some((h) => text.includes(h))).map(
    (s) => s.name
  );
}

/** 링크 안 글자는 20%만. 추천·메뉴·푸터는 거의 링크라 점수가 깎인다. */
export function textWeight(chars: number, inLink: boolean): number {
  if (chars <= 0) return 0;
  return inLink ? chars * 0.2 : chars;
}

/** 가로 400·세로 300 미만은 0. 800×2000 → 4000. */
export function imageCharScore(w: number, h: number): number {
  if (w < 400 || h < 300) return 0;
  return (w * h) / 400;
}

/** 자식 하나가 부모의 70% 이상일 때만 내려간다. 둘이면 부모에 머문다. */
export function soleHeavyChild<T extends { score: number }>(
  parentScore: number,
  children: T[]
): T | null {
  if (parentScore <= 0) return null;
  const heavy = children.filter((c) => c.score >= parentScore * 0.7);
  return heavy.length === 1 ? heavy[0] : null;
}

export function isEmptyExtract(textLen: number, imageCount: number): boolean {
  return textLen < 40 && imageCount === 0;
}

/** 우대만 없는 글 공고는 회사 사진이 있어도 비전으로 보내지 않는다. */
export function sectionsNeedingVision(missing: string[]): string[] {
  return missing.filter((m) => m === "담당업무" || m === "자격요건");
}

/** 실패·이미지 폴백 이유. 정상이면 null. */
export function describeGap(
  missing: string[],
  imageCount: number,
  textLen: number
): string | null {
  if (isEmptyExtract(textLen, imageCount)) {
    return "글자가 거의 없고, 가로 400px·세로 300px 이상인 이미지도 없습니다. 영역 선택이 필요합니다.";
  }
  const core = sectionsNeedingVision(missing);
  if (!core.length) return null;
  if (!imageCount) {
    return `빠진 섹션: ${core.join(", ")}. 큰 이미지가 없어 이미지 처리는 하지 않습니다.`;
  }
  // shortcut: 로컬/저가 OCR 엔진이 없다. 엔진이나 OCR 키가 생기면 비전 LLM보다 먼저 돌릴 것.
  return `빠진 섹션: ${core.join(", ")}. 큰 이미지 ${imageCount}장. 로컬 OCR 엔진이 없어 비전 LLM으로 읽습니다.`;
}

/** 주요업무·우대는 p, 자격요건만 r. 고용조건은 어디에도 넣지 않는다. */
export function splitJobSections(text: string): {
  duty: string;
  required: string;
  preferred: string;
  employment: string;
} {
  const out = { duty: "", required: "", preferred: "", employment: "" };
  let bucket: keyof typeof out | null = null;
  for (const line of text.split(/\n/)) {
    const head = line.replace(/^[\s\[\]■●∙・\-*]+/, "").replace(/\s/g, "");
    if (/^(주요업무|담당업무|업무내용|수행업무)/.test(head)) bucket = "duty";
    else if (/^(자격요건|지원자격|필수조건|필수요건|필수사항)/.test(head))
      bucket = "required";
    else if (/^우대/.test(head)) bucket = "preferred";
    else if (
      /^(근무조건|근무지|모집|급여|고용|복지|근무시간|고용형태)/.test(head)
    )
      bucket = "employment";
    if (bucket) out[bucket] += `\n${line}`;
  }
  return out;
}

/** 신입·경력 n년. 문장 안 단독 '경력'은 잡지 않음. 제목의 '신입'보다 n년 조건을 우선. */
const CAREER_RE =
  /신입\s*[\/·,~～\-]\s*경력(?:\s*\d{1,2}\s*년\s*(?:이상|↑|이하|미만)?)?|경력\s*무관|경력무관|(?:관련\s*)?경력\s*\d{1,2}\s*년\s*(?:이상|↑|이하|미만)?|경력\s*\d{1,2}\s*~\s*\d{1,2}\s*년|신입직|경력직|신입/gi;

export function careerLabel(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  if (/^3y\+$/i.test(s)) return "3년 이상";
  if (/^(신입|경력|신입직|경력직|\d{1,2}\s*년\s*(?:이상|↑|미만|이하))$/.test(s)) {
    return s.replace(/\s+/g, " ");
  }
  const found = [...s.matchAll(CAREER_RE)].map((m) =>
    m[0].replace(/\s+/g, " ").trim()
  );
  const rich = found.find((x) => /년|무관|미만|이상/.test(x));
  return (rich || found[0] || "").slice(0, 24);
}

function ymd(y: number, m: number, d: number): string {
  return `${y}.${String(m).padStart(2, "0")}.${String(d).padStart(2, "0")}`;
}

/** 날짜 바로 뒤, 마감 앞의 시각. 없으면 날짜만. */
function withClock(base: string, tail: string): string {
  const cut = (tail.split("마감")[0] || "").slice(0, 24);
  const hm = cut.match(/(\d{1,2})\s*:\s*(\d{2})/);
  if (hm) return `${base} ${hm[1].padStart(2, "0")}:${hm[2]}`;
  const m = cut.match(/(오전|오후|AM|PM)?\s*(\d{1,2})\s*시(?!간)(?:\s*(\d{1,2})\s*분)?/i);
  if (!m) return base;
  const ap = m[1] ? `${m[1]} ` : "";
  const min = m[3] ? ` ${m[3]}분` : "";
  return `${base} ${ap}${m[2]}시${min}`.replace(/\s+/g, " ").trim();
}

/** 시작/게시일이면 마감이 아님. 기간·마감·까지면 마감 후보. */
function deadlineContextOk(s: string, i: number, len: number): boolean {
  const ctx = s.slice(Math.max(0, i - 20), i + len + 28);
  if (/시작|게시|등록일|공고일|모집일/.test(ctx) && !/마감|까지/.test(ctx)) {
    return false;
  }
  return /마감|까지|(?:접수|모집|지원)\s*기간/.test(ctx);
}

/**
 * 마감일만. 기간 A~B면 끝날짜.
 * '10월 26일 … 마감' 또는 D-5. 연도가 없으면 수집일 기준.
 */
export function deadlineFromText(text: string, now = new Date()): string {
  const s = text.replace(/\s+/g, " ");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  // 2026.11.18 ~ 2026.11.25 / 2026.11.18~11.25 → 끝날짜
  const rangeYmd =
    /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?\s*[~\-–—至到]\s*(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g;
  for (const m of s.matchAll(rangeYmd)) {
    const i = m.index || 0;
    if (!deadlineContextOk(s, i, m[0].length)) continue;
    const y2 = +(m[4] || m[1]);
    const mo2 = +m[5];
    const d2 = +m[6];
    if (mo2 < 1 || mo2 > 12 || d2 < 1 || d2 > 31) continue;
    return withClock(ymd(y2, mo2, d2), s.slice(i + m[0].length));
  }

  for (const m of s.matchAll(/(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*일?/g)) {
    const mo = +m[2];
    const d = +m[3];
    const i = m.index || 0;
    if (!deadlineContextOk(s, i, m[0].length) || mo < 1 || mo > 12 || d < 1 || d > 31) {
      continue;
    }
    // 바로 뒤에 ~ 다른 날짜가 있으면 시작일이므로 스킵 (위에서 범위로 처리)
    if (/^\s*[~\-–—]/.test(s.slice(i + m[0].length))) continue;
    return withClock(ymd(+m[1], mo, d), s.slice(i + m[0].length));
  }
  for (const m of s.matchAll(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/g)) {
    const mo = +m[1];
    const d = +m[2];
    const i = m.index || 0;
    if (!deadlineContextOk(s, i, m[0].length) || mo < 1 || mo > 12 || d < 1 || d > 31) {
      continue;
    }
    if (/^\s*[~\-–—]/.test(s.slice(i + m[0].length))) continue;
    let y = today.getFullYear();
    const dt = new Date(y, mo - 1, d);
    dt.setHours(0, 0, 0, 0);
    if (dt.getTime() < today.getTime() - 14 * 864e5) y += 1;
    return withClock(ymd(y, mo, d), s.slice(i + m[0].length));
  }
  const rel = s.match(/D\s*-\s*(\d{1,3})(?!\d)/i);
  if (rel) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() + +rel[1]);
    return ymd(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  }
  return "";
}

/** 본문으로 내려가며 빠뜨린 상단 줄. 길면 마감·건물 주변만. */
export function metaLines(text: string): string {
  const hits: string[] = [];
  const push = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t && t.length <= 180 && !hits.includes(t)) hits.push(t);
  };
  const keep = /마감|빌딩|타워|사옥|본점|지점|근무지|오전|오후|정규직|계약직/;
  for (const line of text.split(/\n+/)) {
    const s = line.replace(/\s+/g, " ").trim();
    if (!s) continue;
    if (s.length <= 180 && keep.test(s)) {
      push(s);
      continue;
    }
    for (const m of s.matchAll(/[^\n]{0,60}(?:마감|빌딩|타워|사옥|본점|지점)[^\n]{0,40}/g)) {
      push(m[0]);
    }
  }
  return hits.join("\n");
}

/** shortcut: 빌딩/타워 바로 앞 두 글자만. '교원명동빌딩' → 명동빌딩. */
export function placeHint(text: string): string {
  const m = text.match(/([가-힣]{2})(빌딩|타워|사옥|본점|지점|캠퍼스)/);
  return m ? m[1] + m[2] : "";
}

export function isCareerBlob(text: string): boolean {
  const s = text.replace(/^[\s•·\-–]+/, "").replace(/\s+/g, " ").trim();
  const label = careerLabel(s);
  if (!label) return false;
  return s.replace(label, "").replace(/[()（）\s·,./]/g, "").length === 0;
}

/** 이 직무 제목부터 다음 직무 제목 직전까지. 못 찾으면 빈 문자열. */
export function sliceForRole(
  text: string,
  title: string,
  otherTitles: string[]
): string {
  const t = title.trim();
  if (t.length < 2) return "";
  const idx = text.indexOf(t);
  if (idx < 0) return "";
  let end = text.length;
  for (const other of otherTitles) {
    const o = other.trim();
    if (o.length < 2 || o === t) continue;
    const j = text.indexOf(o, idx + t.length);
    if (j >= 0 && j < end) end = j;
  }
  return text.slice(idx, end);
}

export function selfCheck(): void {
  const assert = (ok: boolean, msg: string) => {
    if (!ok) throw new Error(msg);
  };
  assert(imageCharScore(800, 2000) === 4000, "poster area");
  assert(imageCharScore(300, 250) === 0, "banner ignored");
  assert(textWeight(10, true) === 2, "link text 20%");
  assert(textWeight(10, false) === 10, "plain text");
  assert(
    missingSections("담당업무와 자격요건").join() === "우대",
    "missing 우대"
  );
  assert(
    missingSections("주요업무 지원자격 우대사항").length === 0,
    "aliases cover"
  );
  assert(!missingSections("수행업무와 우대사항").includes("담당업무"), "수행업무");
  const kids = [{ score: 80 }, { score: 10 }];
  assert(soleHeavyChild(100, kids) === kids[0], "descend");
  assert(soleHeavyChild(100, [{ score: 80 }, { score: 75 }]) === null, "mixed stay");
  assert(soleHeavyChild(100, [{ score: 50 }]) === null, "no heavy child");
  assert(describeGap(["우대"], 4, 500) === null, "photos ignored when only 우대 missing");
  assert(
    describeGap(["담당업무"], 2, 500)?.includes("비전 LLM") === true,
    "core gap uses vision"
  );
  assert(describeGap([], 0, 500) === null, "complete text");
  assert(isEmptyExtract(10, 0) === true, "empty");
  assert(isEmptyExtract(10, 1) === false, "image saves empty text");
  const parts = splitJobSections(
    "주요업무\nReact\n자격요건\nJava\n우대사항\nPython\n근무조건\n급여"
  );
  assert(parts.duty.includes("React") && !parts.duty.includes("Java"), "duty");
  assert(parts.required.includes("Java") && !parts.required.includes("React"), "req");
  assert(parts.preferred.includes("Python") && !parts.preferred.includes("Java"), "pref");
  const emp = splitJobSections(
    "자격요건\n성실함\n고용조건\n• 정규직전환형\n• 인턴 3개월\n• AI tool"
  );
  assert(emp.required.includes("성실함") && !emp.required.includes("인턴"), "attitude stays");
  assert(emp.employment.includes("인턴") && emp.employment.includes("AI tool"), "employment");
  assert(!emp.duty.includes("인턴") && !emp.preferred.includes("정규직"), "emp not skill");
  const page =
    "금융일반\n주요업무\nReact\n자격요건\nJava\nIT전산\n주요업무\nPython\n자격요건\nSQL";
  const a = sliceForRole(page, "금융일반", ["IT전산"]);
  const b = sliceForRole(page, "IT전산", ["금융일반"]);
  const aParts = splitJobSections(a);
  const bParts = splitJobSections(b);
  assert(aParts.duty.includes("React") && !aParts.duty.includes("Python"), "role a duty");
  assert(aParts.required.includes("Java") && !aParts.required.includes("SQL"), "role a req");
  assert(bParts.duty.includes("Python") && !bParts.duty.includes("React"), "role b duty");
  assert(bParts.required.includes("SQL") && !bParts.required.includes("Java"), "role b req");
  assert(careerLabel("자격요건 경력 3년 이상 Java") === "경력 3년 이상", "years");
  assert(careerLabel("신입/경력 가능") === "신입/경력", "both");
  assert(careerLabel("경력무관") === "경력무관", "any");
  assert(careerLabel("3y+") === "3년 이상", "3y");
  assert(careerLabel("React TypeScript") === "", "no career");
  assert(isCareerBlob("• 경력 3년 이상"), "career blob");
  assert(!isCareerBlob("경력 3년 이상 Java"), "skill line stays");
  assert(careerLabel("신입~ 경력 2년 미만") === "신입~ 경력 2년 미만", "under 2y");
  assert(
    careerLabel("[AI 플랫폼 개발 (신입)]\n신입~ 경력 2년 미만") === "신입~ 경력 2년 미만",
    "years beat title 신입"
  );
  assert(
    deadlineFromText("빌딩10월 26일 오전 12시 마감\nD-5", new Date(2026, 9, 21)) ===
      "2026.10.26 오전 12시",
    "month-day close"
  );
  assert(deadlineFromText("10월 30일 4시 마감", new Date(2026, 9, 21)) === "2026.10.30 4시", "hour");
  assert(deadlineFromText("10월 30일 마감", new Date(2026, 9, 21)) === "2026.10.30", "date only");
  assert(deadlineFromText("10월 30일 24시간 마감", new Date(2026, 9, 21)) === "2026.10.30", "not 시간");
  assert(deadlineFromText("D-5", new Date(2026, 9, 21)) === "2026.10.26", "d-5");
  assert(deadlineFromText("1985년 창립") === "", "history year ignored");
  assert(
    placeHint("IT신입정규직교원명동빌딩10월 26일 오전 12시 마감") === "명동빌딩",
    "place"
  );
  assert(
    metaLines("로그인\nIT신입정규직교원명동빌딩10월 26일 오전 12시 마감").includes("명동빌딩"),
    "meta line"
  );
  assert(
    deadlineFromText("IT신입정규직교원명동빌딩10월 26일 오전 12시 마감", new Date(2026, 9, 21)) ===
      "2026.10.26 오전 12시",
    "smashed header deadline"
  );
  assert(
    deadlineFromText("접수기간 2026.11.18 ~ 2026.11.25", new Date(2026, 10, 20)) ===
      "2026.11.25",
    "range end"
  );
  assert(
    deadlineFromText("공고 시작일 2026.11.18", new Date(2026, 10, 20)) === "",
    "start ignored"
  );
  assert(
    deadlineFromText("접수기간: 2026.11.18~11.30 마감", new Date(2026, 10, 20)) ===
      "2026.11.30",
    "range short end"
  );
}
