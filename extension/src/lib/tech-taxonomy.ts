/** 직무군 — AI compact `c` 또는 직무명 키워드로 분류. */

export type CatKey = "fe" | "data" | "ai" | "be" | "game" | "etc";

export const CATS: { k: CatKey; n: string }[] = [
  { k: "fe", n: "프론트엔드" },
  { k: "data", n: "데이터" },
  { k: "ai", n: "AI·영상처리" },
  { k: "be", n: "백엔드·SI·응용 SW" },
  { k: "game", n: "게임·Unity" },
  { k: "etc", n: "기타·비개발" },
];

const CAT_KEYS = new Set<CatKey>(CATS.map((c) => c.k));

export function isCatKey(v: string | undefined | null): v is CatKey {
  return !!v && CAT_KEYS.has(v as CatKey);
}

/** 직무명(또는 역할 텍스트)에 언급이 있으면 해당 군으로. */
export function inferCat(role: string, skills: string[] = []): CatKey {
  const hay = `${role} ${skills.join(" ")}`.toLowerCase();
  if (/프론트|front[\s-]?end|react|next\.?js|vue|퍼블리셔/.test(hay))
    return "fe";
  if (
    /데이터|data|etl|파이프라인|분석가|analyst/.test(hay) &&
    !/프론트|front/.test(hay)
  )
    return "data";
  if (/ai|llm|딥러닝|머신러닝|영상\s*처리|pytorch|tensorflow|rag/.test(hay))
    return "ai";
  if (/unity|게임|game|언리얼/.test(hay)) return "game";
  if (
    /백엔드|backend|spring|서버|si\b|전산|풀스택|full[\s-]?stack/.test(hay)
  )
    return "be";
  return "etc";
}

const CAT_COLORS: Record<CatKey, string> = {
  fe: "#2f6feb",
  data: "#0e8f7e",
  ai: "#c4501b",
  be: "#7a4fd6",
  game: "#d62c78",
  etc: "#6b7684",
};

export function catColor(k: CatKey): string {
  return CAT_COLORS[k];
}
