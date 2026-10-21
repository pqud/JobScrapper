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

/** 실패·이미지 폴백 이유. 정상이면 null. */
export function describeGap(
  missing: string[],
  imageCount: number,
  textLen: number
): string | null {
  if (isEmptyExtract(textLen, imageCount)) {
    return "글자가 거의 없고, 가로 400px·세로 300px 이상인 이미지도 없습니다. 영역 선택이 필요합니다.";
  }
  if (!missing.length) return null;
  if (!imageCount) {
    return `빠진 섹션: ${missing.join(", ")}. 큰 이미지가 없어 이미지 처리는 하지 않습니다.`;
  }
  // shortcut: 로컬/저가 OCR 엔진이 없다. 엔진이나 OCR 키가 생기면 비전 LLM보다 먼저 돌릴 것.
  return `빠진 섹션: ${missing.join(", ")}. 큰 이미지 ${imageCount}장. 로컬 OCR 엔진이 없어 비전 LLM으로 읽습니다.`;
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
  assert(
    describeGap(["우대"], 2, 500)?.includes("비전 LLM") === true,
    "gap uses vision"
  );
  assert(describeGap([], 0, 500) === null, "complete text");
  assert(isEmptyExtract(10, 0) === true, "empty");
  assert(isEmptyExtract(10, 1) === false, "image saves empty text");
}
