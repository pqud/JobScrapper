import type {
  ExtensionSettings,
  RawJob,
  StructuredRole,
} from "./types";
import { extractKeywords, TECH_KEYWORDS } from "./keyword-extractor";
import {
  careerLabel,
  deadlineFromText,
  isCareerBlob,
  missingSections,
  sliceForRole,
  splitJobSections,
} from "./content-root";
import type { CatKey } from "./tech-taxonomy";
import { estimateUsd } from "./usage";

export interface AiStructureResult {
  companyName?: string;
  title?: string;
  deadline: string | null;
  salary: string | null;
  location: string | null;
  employmentType: string | null;
  /** 특이 유의사항 */
  notes: string[];
  roles: Array<{
    title: string;
    cat: CatKey;
    duties: string[];
    required: string[];
    preferred: string[];
    skills: string[];
    loc?: string;
    exp?: string;
  }>;
}

export interface AiTokenUsage {
  provider: "openai" | "anthropic";
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
}

export interface AiStructureCall {
  data: AiStructureResult;
  usage: AiTokenUsage;
}

/** Compact AI output — tags only. ~100–150 output tokens target. */
type CompactRole = {
  c?: string;
  t?: string;
  r?: unknown;
  p?: unknown;
  x?: unknown;
  /** 경력조건. 신입, 경력 3년 이상 */
  y?: string;
  /** 근무지 */
  loc?: string;
};

type CompactPayload = CompactRole & {
  /** company name (short) — often only visible inside poster image */
  co?: string;
  rs?: CompactRole[];
  sal?: string;
  emp?: string;
  /** 마감. 시간이 있으면 포함 (2026.10.30 4시) */
  dl?: string;
  loc?: string;
  /** 특이 유의사항 (짧은 문장 배열) */
  nt?: unknown;
};

const VOCAB = TECH_KEYWORDS.join(",");

const SYSTEM = `Job posting → compact JSON only. No markdown, no prose, no quotes, no transcription.

Schema (single role):
{"co":"Acme","c":"fe","y":"경력 3년 이상","r":["React","TypeScript"],"p":["Next.js","Auto CAD"],"x":[],"nt":["이력서에 희망 연봉 미기재 시 서류 제외"]}

Several jobs on one page — one rs item per job, never merged:
{"co":"Acme","nt":["이력서에 희망 연봉 미기재 시 서류 제외"],"rs":[{"c":"etc","t":"기계","r":[],"p":["전장조립","Auto CAD"],"x":["기계"]},{"c":"fe","t":"SW Engineering","r":[],"p":["Java","Python"],"x":[]},{"c":"be","t":"Cloud/Infra","r":["AWS","Azure"],"p":[],"x":[]}]}

Keys:
co=company name only. Not the post title.
c=category one of fe|data|ai|be|game|etc. Non-software jobs (기계, 영업, 마케팅, 재무, 품질) → etc. Cloud/infra → be. AI/AX → ai.
r=skills in 자격요건/지원자격/필수. Prefer VOCAB when it matches. Else a short domain keyword ≤24 chars (tool, process, domain skill). Not a sentence.
p=skills under 주요업무/담당업무/수행업무/업무내용/우대/우대사항. Prefer VOCAB when it matches. Else a short domain keyword ≤24 chars. Not 자격요건.
y=career only, ≤24 chars: 신입, 경력 3년 이상, 경력무관, 신입/경력. Not a skill.
x=short extras (major/field label) — max 4 per role, each ≤16 chars. Not the workplace, not career years, not a skill already in r/p.
t=that job's own title, Korean allowed, ≤40 chars.
loc=that job's 근무지 ≤24 chars (e.g. 신사본점). One loc on the root if every job shares it.
sal=pay from 근무조건/급여 ≤40 chars (e.g. 초임 4,641만원). emp=고용형태 ≤16 chars (e.g. 정규직).
dl=마감/접수마감/지원마감 only, ≤32 chars. 접수기간 A~B → B (end). NEVER 공고시작/접수시작/게시일/등록일. Clock when shown: 10월 30일 4시 → 2026.10.30 4시. No time → date only. Do not invent.
nt=unusual applicant notices only (root-level array, max 4, each ≤80 chars). Keep actionable quirks: 희망연봉 필수, 특정 양식 미제출 시 제외, 포트폴리오 URL 필수 등. NEVER boilerplate: 허위사실 시 취소, 개인정보 동의, 일반 제출서류/전형절차 안내, 차별금지 문구. None → [].

VOCAB (when the post names these, r/p must use these exact strings; Korean listed entries allowed):
${VOCAB}

Rules:
1) Output JSON object only. No explanations.
2) Do NOT copy/transcribe posting paragraphs into the JSON.
3) r/p: VOCAB hit → exact VOCAB string. No VOCAB hit but a clear single skill/tool/domain phrase (e.g. Auto CAD, 전장조립, 케이블/커넥터) → keep that short keyword. Never invent tools not in the post. No soft fluff (성실, 소통, 책임감).
4) One page, many jobs: each 담당업무 block or table row is one job. Skills in 주요업무/담당업무/수행업무/우대 → p. Skills in 자격요건/지원자격 → r. C언어 → C.
5) Do not copy another job's skills. A finance row with no tech stays empty. The IT row keeps its own stack.
6) Always include co, sal, emp, loc, and dl when the poster shows them.
7) 고용조건/근무조건/복지/인턴/4대보험/정규직 전환 is employment, not 자격요건. Put the form in emp only. Never copy those bullets into r, p, or x.
8) 신입/경력/n년 이상/경력무관 goes to y only, even when it sits inside 자격요건. Never put it in r, p, or x.
9) Max 12 tags in r and 12 in p per role. Prefer concrete tools/domain skills that show what the job is.
10) dl is the closing deadline only. Date range → last day. Posting/open/start date alone → omit dl (do not copy it).
11) nt only for unusual compliance risks that change how you apply. Skip routine legal/HR boilerplate.`;

const MAX_OUT_TOKENS = 2048;
const MAX_VISION_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_EDGE_PX = 7500;
const TILE_MAX_H = 4000;

const CAT_SET = new Set<CatKey>(["fe", "data", "ai", "be", "game", "etc"]);

const TECH_ALIAS: Record<string, string> = {
  ts: "TypeScript",
  typescript: "TypeScript",
  js: "JavaScript",
  javascript: "JavaScript",
  "node.js": "Node.js",
  nodejs: "Node.js",
  "next.js": "Next.js",
  nextjs: "Next.js",
  "vue.js": "Vue.js",
  vuejs: "Vue.js",
  vue: "Vue",
  "spring boot": "Spring Boot",
  springboot: "Spring Boot",
  k8s: "Kubernetes",
  golang: "Go",
  "react native": "React Native",
  tensorflow: "TensorFlow",
  pytorch: "PyTorch",
  "machine learning": "Machine Learning",
  "deep learning": "Deep Learning",
  "computer vision": "Computer Vision",
  "ci/cd": "CI/CD",
  "github actions": "GitHub Actions",
  c언어: "C",
  "c language": "C",
  oracle: "Oracle",
  rdbms: "RDBMS",
};

const TECH_BY_LOWER = new Map(
  TECH_KEYWORDS.map((k) => [k.toLowerCase(), k as string])
);

function absoluteUrl(src: string): string {
  if (!src) return "";
  if (src.startsWith("//")) return `https:${src}`;
  return src;
}

function buildUserPayload(raw: RawJob, attachImages: boolean): string {
  return JSON.stringify({
    format: attachImages ? "text+image" : "text",
    title: raw.title,
    companyName: raw.companyName,
    text: raw.rawText.slice(0, 10000),
    instruction: attachImages
      ? "Read the image table. Each job block has its own 자격요건/우대 cell. Extract VOCAB or short domain keywords, y, sal, emp, loc. Do not paste paragraphs."
      : undefined,
  });
}

function canonTech(raw: string): string | null {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s || s.length > 40) return null;
  const lower = s.toLowerCase();
  if (TECH_ALIAS[lower]) return TECH_ALIAS[lower];
  if (TECH_BY_LOWER.has(lower)) return TECH_BY_LOWER.get(lower)!;
  return null;
}

/** VOCAB이면 정규화, 아니면 짧은 도메인 키워드 그대로. */
function skillTag(raw: string): string | null {
  const s = String(raw || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s || s.length > 24) return null;
  const canon = canonTech(s);
  if (canon) return canon;
  if (isCareerBlob(s)) return null;
  if (/정규직|계약직|4대보험|연봉|급여|복지|마감|면접|성실|소통|책임감/.test(s))
    return null;
  return s;
}

function techArr(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const c = skillTag(String(item || ""));
    if (!c) continue;
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

function extraArr(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x || "").trim())
    .filter((s) => s && s.length <= 16)
    .slice(0, max);
}

/** 특이 유의사항. 일반 법적 고지 문장은 버린다. */
function noticeArr(v: unknown, max = 4): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const s = String(item || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!s || s.length < 6) continue;
    if (
      /허위\s*사실|개인정보|차별\s*금지|남녀고용|제출\s*서류|전형\s*절차|문의|연락처|회사\s*사정/.test(
        s
      )
    ) {
      continue;
    }
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

function parseCat(c: unknown): CatKey {
  const s = String(c || "").toLowerCase() as CatKey;
  return CAT_SET.has(s) ? s : "etc";
}

/** max_tokens로 잘린 compact JSON 복구: {"c":"ai","r":[]," → {"c":"ai","r":[]} */
function repairTruncatedJson(fragment: string): string {
  let t = fragment.trim();
  // trailing incomplete key / string / comma
  t = t.replace(/,\s*"[^"]*$/, "");
  t = t.replace(/:\s*"[^"]*$/, ':""');
  t = t.replace(/,\s*$/, "");
  t = t.replace(/:\s*$/, ":null");
  const openArr = (t.match(/\[/g) || []).length - (t.match(/\]/g) || []).length;
  const openObj = (t.match(/\{/g) || []).length - (t.match(/\}/g) || []).length;
  if (openArr > 0) t += "]".repeat(openArr);
  if (openObj > 0) t += "}".repeat(openObj);
  return t;
}

function parseCompactJson(text: string): CompactPayload {
  const cleaned = (text || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned) {
    throw new Error("AI 응답이 비어 있습니다. (max_tokens/모델 응답 확인)");
  }
  const start = cleaned.indexOf("{");
  if (start < 0) {
    throw new Error(
      `AI 응답에 JSON이 없습니다: ${cleaned.slice(0, 160).replace(/\s+/g, " ")}`
    );
  }
  const slice = cleaned.slice(start);
  const end = slice.lastIndexOf("}");
  const candidates = [
    end >= 0 ? slice.slice(0, end + 1) : "",
    repairTruncatedJson(slice),
  ].filter(Boolean);

  let lastErr: unknown;
  for (const cand of candidates) {
    try {
      return JSON.parse(cand) as CompactPayload;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `AI JSON 파싱 실패: ${lastErr instanceof Error ? lastErr.message : String(lastErr)} / ${cleaned.slice(0, 160)}`
  );
}

function compactToRoles(
  payload: CompactPayload,
  raw: RawJob
): AiStructureResult["roles"] {
  const rows: CompactRole[] = Array.isArray(payload.rs)
    ? payload.rs
    : [payload];

  const roles = rows
    .slice(0, 20)
    .map((row, i) => {
      const required = techArr(row.r);
      const preferred = techArr(row.p);
      const rawExtras = extraArr(row.x);
      const extras = rawExtras.filter((d) => !isCareerBlob(d));
      const exp = careerLabel(clip(row.y, 24)) || clip(row.y, 24) || careerLabel(rawExtras.join(" "));
      const explicit = String(row.t || "").trim().slice(0, 40);
      const hasBody = required.length + preferred.length + extras.length > 0 || !!exp;
      if (rows.length > 1 && !explicit && !hasBody) return null;
      const cat = parseCat(row.c);
      const title =
        explicit ||
        (rows.length > 1 ? `${raw.title || "Role"} ${i + 1}` : raw.title) ||
        "Role";
      const loc = clip(row.loc, 40);
      return {
        title,
        cat,
        duties: extras,
        required,
        preferred,
        skills: [], // required에만 두고 job-map이 required 사용 (중복 방지)
        ...(loc ? { loc } : {}),
        ...(exp ? { exp } : {}),
      };
    })
    .filter((r): r is NonNullable<typeof r> => !!r && !!(r.required.length || r.preferred.length || r.duties.length || r.title));

  if (roles.length) return roles;
  return [
    {
      title: raw.title || "Role",
      cat: "etc",
      duties: [],
      required: [],
      preferred: [],
      skills: [],
    },
  ];
}

function pickCompany(aiCo: unknown, raw: RawJob): string {
  const fromAi = String(aiCo || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
  const bad = !fromAi || /미상|잡코리아|원티드|wanted|jobkorea|채용정보/i.test(fromAi);
  if (!bad) return fromAi;
  const fromPage = (raw.companyName || "").trim();
  if (fromPage && !/미상|잡코리아|원티드/i.test(fromPage)) return fromPage;
  return fromPage || fromAi || "회사 미상";
}

/** 직무마다 자기 구간만 본다. 주요업무·우대는 p, 자격요건만 r. */
function fillMissingVocabFromText(
  roles: AiStructureResult["roles"],
  raw: RawJob
): AiStructureResult["roles"] {
  const text = raw.rawText || "";
  const titles = roles.map((r) => r.title || "");
  return roles.map((role) => {
    const slice =
      sliceForRole(
        text,
        role.title || "",
        titles.filter((t) => t !== role.title)
      ) || (roles.length === 1 ? text : "");
    if (!slice) return role;
    const { duty, required, preferred, employment } = splitJobSections(slice);
    const prefList = extractKeywords(`${duty}\n${preferred}`);
    const reqList = extractKeywords(required);
    const empList = extractKeywords(employment);
    const prefSet = new Set(prefList.map((t) => t.toLowerCase()));
    const reqSet = new Set(reqList.map((t) => t.toLowerCase()));
    const empSet = new Set(empList.map((t) => t.toLowerCase()));
    const onlyEmp = (t: string) =>
      empSet.has(t.toLowerCase()) && !reqSet.has(t.toLowerCase()) && !prefSet.has(t.toLowerCase());
    const fromEmpText = (t: string) =>
      employment.includes(t) && !required.includes(t) && !duty.includes(t) && !preferred.includes(t);
    if (!prefSet.size && !reqSet.size && !employment.trim()) return role;
    const isReq = (t: string) => reqSet.has(t.toLowerCase());
    const isPref = (t: string) => prefSet.has(t.toLowerCase());
    const requiredOut = [
      ...role.required.filter((t) => (isReq(t) || !isPref(t)) && !onlyEmp(t) && !fromEmpText(t)),
      ...reqList,
    ];
    const seenR = new Set<string>();
    const requiredDedup = requiredOut.filter((t) => {
      const k = t.toLowerCase();
      if (seenR.has(k) || (isPref(t) && !isReq(t))) return false;
      seenR.add(k);
      return true;
    });
    const preferredDedup: string[] = [];
    const seenP = new Set<string>();
    for (const t of [...role.preferred.filter((x) => !isReq(x) && !onlyEmp(x) && !fromEmpText(x)), ...prefList]) {
      const k = t.toLowerCase();
      if (seenP.has(k) || seenR.has(k) || isReq(t)) continue;
      seenP.add(k);
      preferredDedup.push(t);
    }
    return {
      ...role,
      duties: role.duties.filter((d) => !fromEmpText(d)),
      required: requiredDedup,
      preferred: preferredDedup,
    };
  });
}

function applyCareer(
  roles: AiStructureResult["roles"],
  raw: RawJob
): AiStructureResult["roles"] {
  const text = raw.rawText || "";
  const titles = roles.map((r) => r.title || "");
  return roles.map((role) => {
    const slice =
      sliceForRole(
        text,
        role.title || "",
        titles.filter((t) => t !== role.title)
      ) || (roles.length === 1 ? text : "");
    const fromText = careerLabel(slice);
    const exp =
      (fromText && /년|무관|미만|이상/.test(fromText) ? fromText : "") ||
      role.exp ||
      fromText;
    const duties = role.duties.filter((d) => !isCareerBlob(d));
    return exp ? { ...role, duties, exp } : { ...role, duties };
  });
}

function clip(v: unknown, max: number): string {
  return String(v || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** AI가 기간 시작일을 dl에 넣은 경우 버린다. 끝날짜는 deadlineFromText가 이미 처리. */
function sanitizeAiDeadline(text: string, aiDl: string): string {
  if (!aiDl) return "";
  const s = (text || "").replace(/\s+/g, " ");
  const m = aiDl.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (!m) return aiDl;
  // 원문에 "start ~ …" 형태면 시작일 거부
  const re = new RegExp(
    `${m[1]}\\s*[.\\-/년]\\s*${+m[2]}\\s*[.\\-/월]\\s*${+m[3]}\\s*일?\\s*[~\\-–—]`
  );
  if (re.test(s)) return "";
  if (
    new RegExp(
      `(?:시작|게시|등록일|공고일)[^0-9]{0,12}${m[1]}[.\\-/]${m[2]}[.\\-/]${m[3]}`
    ).test(s)
  ) {
    return "";
  }
  return aiDl;
}

function normalizeResult(
  payload: CompactPayload,
  raw: RawJob
): AiStructureResult {
  const roles = applyCareer(fillMissingVocabFromText(compactToRoles(payload, raw), raw), raw);
  const roleLocs = [
    ...new Set(roles.map((r) => r.loc).filter((s): s is string => !!s)),
  ];
  return {
    companyName: pickCompany(payload.co, raw),
    title: raw.title,
    // 원문 기간/마감 파싱을 AI dl보다 우선 (시작일을 마감으로 쓰는 실수 방지)
    deadline:
      deadlineFromText(raw.rawText) ||
      sanitizeAiDeadline(raw.rawText, clip(payload.dl, 40)) ||
      raw.deadlineHint ||
      null,
    salary: clip(payload.sal, 60) || raw.salaryHint || null,
    location:
      clip(payload.loc, 40) ||
      (roleLocs.length ? roleLocs.join(" · ") : "") ||
      raw.locationHint ||
      null,
    employmentType: clip(payload.emp, 24) || raw.employmentHint || null,
    notes: noticeArr(payload.nt),
    roles,
  };
}

export function toStructuredRoles(data: AiStructureResult): StructuredRole[] {
  return data.roles.map((r, i) => ({
    id: `role-${i}`,
    title: r.title,
    cat: r.cat,
    duties: r.duties,
    required: r.required,
    preferred: r.preferred,
    skills: r.skills,
    ...(r.loc ? { loc: r.loc } : {}),
    ...(r.exp ? { exp: r.exp } : {}),
  }));
}

type FetchedImage = {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  base64: string;
};

function canvasToJpegBase64(
  canvas: OffscreenCanvas,
  quality = 0.85
): Promise<FetchedImage> {
  return canvas.convertToBlob({ type: "image/jpeg", quality }).then(async (blob) => {
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { mediaType: "image/jpeg" as const, base64: btoa(binary) };
  });
}

async function bitmapToVisionTiles(
  bitmap: ImageBitmap
): Promise<FetchedImage[]> {
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const full = new OffscreenCanvas(w, h);
  const ctx = full.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return [];
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const tiles: FetchedImage[] = [];
  if (h <= TILE_MAX_H) {
    tiles.push(await canvasToJpegBase64(full));
    return tiles;
  }

  const overlap = 80;
  let y = 0;
  while (y < h && tiles.length < MAX_VISION_IMAGES) {
    const th = Math.min(TILE_MAX_H, h - y);
    const tile = new OffscreenCanvas(w, th);
    const tctx = tile.getContext("2d");
    if (!tctx) break;
    tctx.drawImage(full, 0, y, w, th, 0, 0, w, th);
    tiles.push(await canvasToJpegBase64(tile));
    if (y + th >= h) break;
    y += th - overlap;
  }
  return tiles;
}

async function fetchImageAsVisionTiles(url: string): Promise<FetchedImage[]> {
  const href = absoluteUrl(url);
  if (!href || href.startsWith("data:")) return [];
  try {
    const res = await fetch(href, { credentials: "omit" });
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > MAX_IMAGE_BYTES) return [];
    const blob = new Blob([buf], {
      type: res.headers.get("content-type") || "image/jpeg",
    });
    const bitmap = await createImageBitmap(blob);
    return bitmapToVisionTiles(bitmap);
  } catch {
    return [];
  }
}

async function loadVisionImages(raw: RawJob): Promise<FetchedImage[]> {
  if (!raw.imageUrls.length) return [];
  const urls = raw.imageUrls
    .map(absoluteUrl)
    .filter(Boolean)
    .slice(0, MAX_VISION_IMAGES);
  const out: FetchedImage[] = [];
  for (const url of urls) {
    if (out.length >= MAX_VISION_IMAGES) break;
    const tiles = await fetchImageAsVisionTiles(url);
    for (const t of tiles) {
      if (out.length >= MAX_VISION_IMAGES) break;
      out.push(t);
    }
  }
  return out;
}

function packUsage(
  provider: "openai" | "anthropic",
  model: string,
  inputTokens: number,
  outputTokens: number,
  totalTokens?: number
): AiTokenUsage {
  const total = totalTokens ?? inputTokens + outputTokens;
  return {
    provider,
    model,
    inputTokens,
    outputTokens,
    totalTokens: total,
    estimatedUsd: estimateUsd(model, inputTokens, outputTokens),
  };
}

/** 담당업무·자격요건이 글에 있으면 회사 사진 등 이미지를 보내지 않는다. */
function textCoversCoreSections(raw: RawJob): boolean {
  const missing = missingSections(raw.rawText || "");
  return !missing.includes("담당업무") && !missing.includes("자격요건");
}

function userInstruction(raw: RawJob): string {
  const must =
    'Return ONE complete JSON object and stop. If several jobs are listed, use rs with one item each. Read each 자격요건/우대 cell. Career years go to y, not r/p/x. VOCAB when listed; else short domain keywords (e.g. Auto CAD, 전장조립). dl=마감 only (range end; never 시작/게시일). nt=unusual notices only (e.g. 희망연봉 미기재 시 서류 제외), not legal boilerplate. Example: {"co":"Acme","sal":"초임 4,641만원","emp":"정규직","dl":"2026.11.25","nt":["이력서에 희망 연봉 미기재 시 서류 제외"],"rs":[{"c":"etc","t":"전장조립","y":"경력무관","r":[],"p":["전장조립","Auto CAD"],"loc":"아산"},{"c":"be","t":"IT전산","y":"경력 3년 이상","r":[],"p":["C","Java","Spring","SQL"],"loc":"신사본점"}]}. Max 12 tags in r and in p per role. Close all brackets.';
  const attachImages = raw.imageUrls.length > 0 && !textCoversCoreSections(raw);
  return `${must}\n${buildUserPayload(raw, attachImages)}`;
}

async function callOpenAI(
  settings: ExtensionSettings,
  raw: RawJob
): Promise<AiStructureCall> {
  const model = settings.openaiModel || "gpt-4o-mini";
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: userInstruction(raw) },
  ];
  const skipImages = textCoversCoreSections(raw);
  const images = skipImages ? [] : await loadVisionImages(raw);
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    });
  }
  if (
    !skipImages &&
    raw.imageUrls.length &&
    !images.length &&
    raw.rawText.trim().length < 40
  ) {
    throw new Error(
      `큰 이미지 ${raw.imageUrls.length}장을 불러오지 못했고, 대신 쓸 글자도 없습니다.`
    );
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: MAX_OUT_TOKENS,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content },
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  const u = json.usage || {};
  return {
    data: normalizeResult(parseCompactJson(text), raw),
    usage: packUsage(
      "openai",
      model,
      Number(u.prompt_tokens) || 0,
      Number(u.completion_tokens) || 0,
      Number(u.total_tokens) || undefined
    ),
  };
}

/**
 * Claude 5.x는 adaptive thinking이 기본이라 max_tokens를 사고에 다 쓰면 text가 비다.
 * JSON 구조화에는 사고가 필요 없으니 끈다.
 * Sonnet/Opus 5.5는 disabled가 400이라 between_tools 사용.
 */
function anthropicThinkingOff(
  model: string
): Record<string, string> | undefined {
  const m = model.toLowerCase();
  if (/claude-(haiku|sonnet|opus)-4|claude-3/.test(m)) return undefined;
  if (/sonnet-5|opus-5|fable/.test(m)) return { type: "between_tools" };
  if (/haiku-5/.test(m)) return { type: "disabled" };
  return { type: "disabled" };
}

async function callAnthropic(
  settings: ExtensionSettings,
  raw: RawJob
): Promise<AiStructureCall> {
  const model = settings.anthropicModel || "claude-haiku-5-5";
  const content: Array<Record<string, unknown>> = [];
  const skipImages = textCoversCoreSections(raw);
  const images = skipImages ? [] : await loadVisionImages(raw);
  for (const img of images) {
    content.push({
      type: "image",
      source: {
        type: "base64",
        media_type: img.mediaType,
        data: img.base64,
      },
    });
  }
  content.push({ type: "text", text: userInstruction(raw) });
  if (
    !skipImages &&
    raw.imageUrls.length &&
    !images.length &&
    raw.rawText.trim().length < 40
  ) {
    throw new Error(
      `큰 이미지 ${raw.imageUrls.length}장을 불러오지 못했고, 대신 쓸 글자도 없습니다.`
    );
  }

  const thinking = anthropicThinkingOff(model);
  const headers = {
    "x-api-key": settings.apiKey,
    "anthropic-version": "2023-06-01",
    "Content-Type": "application/json",
  };
  const makeBody = (think: Record<string, string> | undefined) => {
    const body: Record<string, unknown> = {
      model,
      max_tokens: MAX_OUT_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    };
    if (think) body.thinking = think;
    return body;
  };

  let res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(makeBody(thinking)),
  });
  // disabled 거절 시 between_tools로 한 번 더
  if (!res.ok && res.status === 400 && thinking?.type === "disabled") {
    const errOnce = await res.text();
    if (/thinking/i.test(errOnce)) {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers,
        body: JSON.stringify(makeBody({ type: "between_tools" })),
      });
    } else {
      throw new Error(`Anthropic 400: ${errOnce.slice(0, 200)}`);
    }
  }
  if (!res.ok) {
    const err = await res.text();
    if (/CORS|browser/i.test(err)) {
      throw new Error(
        "Anthropic가 브라우저/확장 직접 호출을 막고 있습니다. OpenAI로 바꾸거나, Anthropic 조직 설정에서 Direct browser access를 허용해 주세요."
      );
    }
    if (res.status === 401) {
      throw new Error(
        "Anthropic 인증 실패(401). API 키를 확인하고, 조직 CORS 차단이면 OpenAI를 사용해 주세요."
      );
    }
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }
  const json = await res.json();
  const blocks = (json.content || []) as Array<{ type: string; text?: string }>;
  const text = blocks
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("\n");
  if (!text.trim()) {
    const kinds = blocks.map((b) => b.type).join(",") || "none";
    const stop = String(json.stop_reason || "?");
    throw new Error(
      `AI 응답이 비어 있습니다. stop=${stop} blocks=[${kinds}]. Claude 5 thinking이 max_tokens를 썼을 수 있습니다.`
    );
  }
  const u = json.usage || {};
  return {
    data: normalizeResult(parseCompactJson(text), raw),
    usage: packUsage(
      "anthropic",
      model,
      Number(u.input_tokens) || 0,
      Number(u.output_tokens) || 0
    ),
  };
}

export async function structureWithAi(
  settings: ExtensionSettings,
  raw: RawJob
): Promise<AiStructureCall> {
  if (!settings.apiKey?.trim()) {
    throw new Error("API 키를 설정해 주세요.");
  }
  if (settings.provider === "anthropic") {
    return callAnthropic(settings, raw);
  }
  return callOpenAI(settings, raw);
}
