import type {
  ExtensionSettings,
  RawJob,
  StructuredRole,
} from "./types";
import { extractKeywords, TECH_KEYWORDS } from "./keyword-extractor";
import type { CatKey } from "./tech-taxonomy";
import { estimateUsd } from "./usage";

export interface AiStructureResult {
  companyName?: string;
  title?: string;
  deadline: string | null;
  salary: string | null;
  location: string | null;
  employmentType: string | null;
  roles: Array<{
    title: string;
    cat: CatKey;
    duties: string[];
    required: string[];
    preferred: string[];
    skills: string[];
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
};

type CompactPayload = CompactRole & {
  /** company name (short) — often only visible inside poster image */
  co?: string;
  rs?: CompactRole[];
};

const VOCAB = TECH_KEYWORDS.join(",");

const SYSTEM = `Job posting → compact JSON only. No markdown, no prose, no quotes, no transcription.

Schema (single role):
{"co":"Acme","c":"fe","r":["React","TypeScript"],"p":["Next.js"],"x":["3y+"]}

Several jobs on one page — one rs item per job, never merged:
{"co":"Acme","rs":[{"c":"etc","t":"기계","r":[],"p":[],"x":["기계","서울"]},{"c":"fe","t":"SW Engineering","r":[],"p":["Java","Python"],"x":[]},{"c":"be","t":"Cloud/Infra","r":["AWS","Azure"],"p":[],"x":[]}]}

Keys:
co=company name ≤40 chars (from page or poster image). Real company only — not JobKorea/Wanted.
c=category one of fe|data|ai|be|game|etc. Non-software jobs (기계, 영업, 마케팅, 재무, 품질) → etc. Cloud/infra → be. AI/AX → ai.
r=required VOCAB in 자격요건/필수/수행업무/담당업무 (exact spelling)
p=VOCAB listed under 우대/우대사항 only
x=short extras (major, city, 3y+) — max 4 per role, each ≤16 chars. Not full sentences.
t=that job's own title, Korean allowed, ≤40 chars. Required when there are 2+ jobs.

VOCAB (r/p must be exact strings from this list only; Korean entries allowed if listed):
${VOCAB}

Rules:
1) Output JSON object only. No explanations.
2) Do NOT copy/transcribe posting text into the JSON.
3) r/p: only exact VOCAB strings. Not in VOCAB → omit. Do not invent synonyms.
4) One page, many jobs: a table row (모집부문/모집직무/전공/근무지) is one job. A block with its own 수행업무 and 우대사항 is one job. Emit every row or block, up to 20. Do not collapse them into one role. A row with no VOCAB still needs t and may have empty r/p.
5) Within one job, include every VOCAB term in that job's text. Do not move another job's skills into this one.
6) Always include co when readable (esp. image posters). Omit salary/location/deadline.`;

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
};

const TECH_BY_LOWER = new Map(
  TECH_KEYWORDS.map((k) => [k.toLowerCase(), k as string])
);

function absoluteUrl(src: string): string {
  if (!src) return "";
  if (src.startsWith("//")) return `https:${src}`;
  return src;
}

function buildUserPayload(raw: RawJob): string {
  const withImages = raw.imageUrls.length > 0;
  return JSON.stringify({
    format: withImages ? "text+image" : "text",
    title: raw.title,
    companyName: raw.companyName,
    text: raw.rawText.slice(0, 10000),
    instruction: withImages
      ? "Text may miss a section. Images attached. Do NOT transcribe. Emit compact schema JSON only."
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

function techArr(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of v) {
    const c = canonTech(String(item || ""));
    if (!c || seen.has(c)) continue;
    seen.add(c);
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
      const extras = extraArr(row.x);
      const explicit = String(row.t || "").trim().slice(0, 40);
      const hasBody = required.length + preferred.length + extras.length > 0;
      if (rows.length > 1 && !explicit && !hasBody) return null;
      const cat = parseCat(row.c);
      const title =
        explicit ||
        (rows.length > 1 ? `${raw.title || "Role"} ${i + 1}` : raw.title) ||
        "Role";
      return {
        title,
        cat,
        duties: extras,
        required,
        preferred,
        skills: [], // required에만 두고 job-map이 required 사용 (중복 방지)
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

/** AI often under-lists; fill VOCAB hits from title + raw text (incl. image jobs' titles). */
function fillMissingVocabFromText(
  roles: AiStructureResult["roles"],
  raw: RawJob
): AiStructureResult["roles"] {
  if (!roles.length || roles.length > 1) return roles;
  const found = extractKeywords(
    `${raw.title}\n${raw.companyName}\n${raw.rawText}`
  );
  if (!found.length) return roles;
  return roles.map((role, i) => {
    if (i > 0) return role;
    const have = new Set(
      [...role.required, ...role.preferred].map((s) => s.toLowerCase())
    );
    const add = found.filter((t) => !have.has(t.toLowerCase()));
    return add.length ? { ...role, required: [...role.required, ...add] } : role;
  });
}

function normalizeResult(
  payload: CompactPayload,
  raw: RawJob
): AiStructureResult {
  return {
    companyName: pickCompany(payload.co, raw),
    title: raw.title,
    deadline: raw.deadlineHint || null,
    salary: raw.salaryHint || null,
    location: raw.locationHint || null,
    employmentType: raw.employmentHint || null,
    roles: fillMissingVocabFromText(compactToRoles(payload, raw), raw),
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

function userInstruction(raw: RawJob): string {
  const must =
    'Return ONE complete JSON object and stop. If several jobs are listed, use rs with one item each. Example: {"co":"Acme","rs":[{"c":"etc","t":"기계","r":[],"p":[],"x":["서울"]},{"c":"be","t":"Cloud","r":["AWS"],"p":["Python"],"x":[]}]}. Max 12 VOCAB tags per role, not for the whole page. Close all brackets.';
  return `${must}\n${buildUserPayload(raw)}`;
}

async function callOpenAI(
  settings: ExtensionSettings,
  raw: RawJob
): Promise<AiStructureCall> {
  const model = settings.openaiModel || "gpt-4o-mini";
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: userInstruction(raw) },
  ];
  const images = await loadVisionImages(raw);
  for (const img of images) {
    content.push({
      type: "image_url",
      image_url: { url: `data:${img.mediaType};base64,${img.base64}` },
    });
  }
  if (raw.imageUrls.length && !images.length && raw.rawText.trim().length < 40) {
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

async function callAnthropic(
  settings: ExtensionSettings,
  raw: RawJob
): Promise<AiStructureCall> {
  const model = settings.anthropicModel || "claude-haiku-5-5";
  const content: Array<Record<string, unknown>> = [];
  const images = await loadVisionImages(raw);
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
  if (raw.imageUrls.length && !images.length && raw.rawText.trim().length < 40) {
    throw new Error(
      `큰 이미지 ${raw.imageUrls.length}장을 불러오지 못했고, 대신 쓸 글자도 없습니다.`
    );
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUT_TOKENS,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    }),
  });
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
  const text =
    (json.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n") || "";
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
