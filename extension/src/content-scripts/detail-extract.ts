/**
 * Site-agnostic detail extract:
 * 1) real article/template body text → article (text AI)
 * 2) else poster images (CDN / p.web) → image (vision)
 * 3) chrome-only sidebar text must NOT force article when posters exist
 */

type JobFormat = "article" | "image" | "unknown";

interface RawJobPayload {
  url: string;
  title: string;
  companyName: string;
  format: JobFormat;
  rawText: string;
  imageUrls: string[];
  salaryHint: string;
  locationHint: string;
  employmentHint: string;
  deadlineHint: string;
  scrapedAt: string;
}

const MIN_BODY_CHARS = 200;

function isJunkImage(src: string, alt = ""): boolean {
  const s = (src || "").toLowerCase();
  const a = (alt || "").toLowerCase();
  if (!s || s.startsWith("data:")) return true;
  const deny = [
    "logo",
    "favicon",
    "sprite",
    "icon",
    "blank.gif",
    "spacer.gif",
    "ads.",
    "analytics",
    "tracking",
    "onepick-title",
    "avatar",
    "profile",
  ];
  return deny.some((d) => s.includes(d) || a.includes(d));
}

function isPosterUrl(src: string): boolean {
  return /file\d*\.jobkorea\.co\.kr|greetinghr|\/Mng\/|opening-attachments|cdn\.|attachments/i.test(
    src
  );
}

function pageTitle(): string {
  const h1 = document.querySelector("h1");
  const t = (h1?.textContent || document.title || "")
    .replace(/\s*[|｜].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 200);
}

function pageCompany(): string {
  const sels = [
    ".coName",
    "span.coName",
    ".corp-name",
    '[class*="company"] a',
    '[data-company-name]',
  ];
  for (const sel of sels) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const t = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (t && t.length < 80 && !/잡코리아|원티드|wanted|채용정보/.test(t)) {
      return t;
    }
  }
  const m = (document.title || "").match(/^(.+?)\s*채용/);
  return m ? m[1].trim().slice(0, 80) : "";
}

/** Real posting body — not the JobKorea chrome / sidebar. */
function bodyTextFromDoc(doc: Document): string {
  const sels = [
    "ul.detail-section li.detail-article",
    "li.detail-article",
    ".view-content-detail",
    ".artTplInner",
    "#artTplInner",
    "[class*='artTpl']",
    ".tbDetail",
    "#job-detail",
    "p.web",
    ".web",
  ];
  const chunks: string[] = [];
  for (const sel of sels) {
    for (const el of Array.from(doc.querySelectorAll(sel))) {
      const t = ((el as HTMLElement).innerText || "").replace(/\n{3,}/g, "\n\n").trim();
      if (t.length > 40) chunks.push(t);
    }
  }
  return chunks.join("\n\n").trim();
}

function collectBodyText(): string {
  let best = bodyTextFromDoc(document);
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const doc = frame.contentDocument;
      if (!doc) continue;
      const t = bodyTextFromDoc(doc);
      if (t.length > best.length) best = t;
    } catch {
      /* cross-origin */
    }
  }
  return best.slice(0, 20000);
}

function collectImages(): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  const add = (src: string, alt = "", prefer = false) => {
    const s = src.trim();
    if (!s || seen.has(s) || isJunkImage(s, alt)) return;
    const abs = s.startsWith("//") ? `https:${s}` : s;
    const poster = isPosterUrl(abs) || prefer;
    if (!poster) {
      // only keep non-CDN if looks large / file-like
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(abs)) return;
    }
    seen.add(s);
    urls.push(abs);
  };

  const scan = (root: Document | Element) => {
    // Prefer known posting image containers first
    for (const img of Array.from(
      root.querySelectorAll("p.web img, .web img, .view-content-detail img")
    )) {
      add(
        img.getAttribute("src") || img.getAttribute("data-src") || "",
        img.getAttribute("alt") || "",
        true
      );
    }
    for (const img of Array.from(root.querySelectorAll("img"))) {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      const alt = img.getAttribute("alt") || "";
      const w = (img as HTMLImageElement).naturalWidth || img.width || 0;
      const h = (img as HTMLImageElement).naturalHeight || img.height || 0;
      if (isPosterUrl(src) || (w >= 400 && h >= 400)) {
        add(src, alt, true);
      }
    }
  };

  scan(document);
  for (const frame of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const doc = frame.contentDocument;
      if (doc) scan(doc);
    } catch {
      /* cross-origin */
    }
  }
  // Posters first
  urls.sort((a, b) => Number(isPosterUrl(b)) - Number(isPosterUrl(a)));
  return urls.slice(0, 5);
}

function decideFormat(
  bodyText: string,
  imageUrls: string[]
): JobFormat {
  const posters = imageUrls.filter(isPosterUrl);
  const hasBody = bodyText.length >= MIN_BODY_CHARS;
  // Image posting: CDN posters / p.web images without a real text body
  if (posters.length && !hasBody) return "image";
  if (imageUrls.length && !hasBody) return "image";
  if (hasBody) return "article";
  if (posters.length || imageUrls.length) return "image";
  if (bodyText.length >= 80) return "article";
  return "unknown";
}

function extractOnce(): Omit<RawJobPayload, "scrapedAt"> & {
  ready: boolean;
} {
  const url = location.href.split("#")[0];
  const title = pageTitle();
  const companyName = pageCompany() || "회사 미상";
  const bodyText = collectBodyText();
  const imageUrls = collectImages();
  const format = decideFormat(bodyText, imageUrls);
  const posters = imageUrls.filter(isPosterUrl);

  // iframe 포스터/본문 올 때까지 대기 (사이드바만 있으면 ready=false)
  const waitingForIframe =
    !bodyText &&
    !posters.length &&
    document.querySelectorAll("iframe").length > 0;
  const ready =
    (format === "article" || format === "image") && !waitingForIframe;

  return {
    url,
    title,
    companyName,
    format,
    rawText:
      format === "image"
        ? `[이미지 공고]\n` + imageUrls.map((u) => `- ${u}`).join("\n")
        : bodyText,
    imageUrls: format === "image" ? imageUrls : [],
    salaryHint: "",
    locationHint: "",
    employmentHint: "",
    deadlineHint: "",
    ready,
  };
}

async function waitAndExtract(timeoutMs = 14000): Promise<RawJobPayload | null> {
  const start = Date.now();
  let last: ReturnType<typeof extractOnce> | null = null;
  while (Date.now() - start < timeoutMs) {
    last = extractOnce();
    if (last.ready && (last.format === "article" || last.format === "image")) {
      const { ready: _r, ...raw } = last;
      return { ...raw, scrapedAt: new Date().toISOString() };
    }
    await new Promise((r) => setTimeout(r, 450));
  }
  if (last) {
    // Timeout: prefer image if any poster/url survived
    const format =
      last.format !== "unknown"
        ? last.format
        : last.imageUrls.length
          ? "image"
          : last.rawText.length >= 80
            ? "article"
            : "unknown";
    if (format === "unknown") return null;
    const { ready: _r, ...rest } = last;
    return {
      ...rest,
      format,
      rawText:
        format === "image"
          ? `[이미지 공고]\n` + rest.imageUrls.map((u) => `- ${u}`).join("\n")
          : rest.rawText,
      imageUrls: format === "image" ? rest.imageUrls : [],
      scrapedAt: new Date().toISOString(),
    };
  }
  return null;
}

try {
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "EXTRACT_RAW") {
        void waitAndExtract(message.timeoutMs ?? 14000)
          .then((raw) => {
            if (!raw) sendResponse({ ok: false, error: "extract_failed" });
            else sendResponse({ ok: true, raw });
          })
          .catch((err) => {
            sendResponse({
              ok: false,
              error: err instanceof Error ? err.message : "extract_error",
            });
          });
        return true;
      }
      return false;
    });
  }
} catch {
  /* ignore */
}
