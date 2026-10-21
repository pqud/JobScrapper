/**
 * 모든 프레임에서 본문 루트를 고른다.
 * 글자 수(링크 안은 20%) + 큰 이미지 면적. nav/footer만 제외. aside는 포함.
 * 자식 하나가 부모 점수의 70% 이상이면 그 자식으로 내려간다.
 */

import {
  describeGap,
  imageCharScore,
  isEmptyExtract,
  missingSections,
  soleHeavyChild,
  textWeight,
} from "../lib/content-root";

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);

export interface FrameSnap {
  href: string;
  isTop: boolean;
  title: string;
  companyName: string;
  score: number;
  text: string;
  imageUrls: string[];
  missing: string[];
  widenedText: string;
  widenedImages: string[];
  widenedMissing: string[];
  note: string | null;
}

interface Scored {
  el: HTMLElement;
  score: number;
  images: string[];
  parent: Scored | null;
  children: Scored[];
}

function excluded(el: Element): boolean {
  if (el.matches("nav, footer, [role=navigation]")) return true;
  const s = getComputedStyle(el);
  if (s.display === "none") return true;
  const r = el.getBoundingClientRect();
  return r.width < 1 || r.height < 1;
}

function absUrl(src: string): string {
  try {
    return new URL(src, location.href).href;
  } catch {
    return "";
  }
}

function scoreTree(el: Element, parent: Scored | null): Scored | null {
  if (!(el instanceof HTMLElement)) return null;
  if (SKIP_TAGS.has(el.tagName) || el.id === "jobscrap-pick") return null;
  if (excluded(el)) return null;

  let score = 0;
  const images: string[] = [];
  const inLink = !!el.closest("a");
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const chars = (node.textContent || "").replace(/\s+/g, "").length;
    score += textWeight(chars, inLink);
  }
  if (el instanceof HTMLImageElement) {
    const r = el.getBoundingClientRect();
    const add = imageCharScore(r.width, r.height);
    if (add > 0) {
      score += add;
      const src = absUrl(el.currentSrc || el.src || el.getAttribute("data-src") || "");
      if (src && !src.startsWith("data:")) images.push(src);
    }
  }

  const node: Scored = { el, score, images, parent, children: [] };
  for (const child of el.children) {
    const sub = scoreTree(child, node);
    if (!sub) continue;
    node.children.push(sub);
    node.score += sub.score;
    node.images.push(...sub.images);
  }
  return node;
}

function descend(node: Scored): Scored {
  const next = soleHeavyChild(node.score, node.children);
  return next ? descend(next) : node;
}

function cleanText(el: HTMLElement): string {
  return (el.innerText || "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 20000);
}

function guessCompany(): string {
  const bits = [document.title || "", document.querySelector("h1")?.textContent || ""];
  for (const raw of bits) {
    const s = raw.replace(/\s+/g, " ").trim();
    if (!s) continue;
    const lead = s.match(/^(.+?)\s*채용/);
    if (
      lead &&
      lead[1].trim().length < 40 &&
      !/잡코리아|원티드|wanted|jobkorea/i.test(lead[1])
    ) {
      return lead[1].trim();
    }
    const bracket = s.match(/\[([^\]]{1,40})\]/);
    if (bracket && !/잡코리아|원티드|wanted|jobkorea/i.test(bracket[1])) {
      return bracket[1].trim();
    }
  }
  return "";
}

function pack(root: Scored, wider: Scored | null): FrameSnap {
  const text = cleanText(root.el);
  const imageUrls = [...new Set(root.images)].slice(0, 5);
  const missing = missingSections(text);
  const widenedText = wider ? cleanText(wider.el) : text;
  const widenedImages = wider ? [...new Set(wider.images)].slice(0, 5) : imageUrls;
  const widenedMissing = missingSections(widenedText);
  const note = describeGap(missing, imageUrls.length, text.length);
  return {
    href: location.href.split("#")[0],
    isTop: window.top === window,
    title: (document.querySelector("h1")?.textContent || document.title || "")
      .replace(/\s*[|｜].*$/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200),
    companyName: guessCompany(),
    score: root.score,
    text,
    imageUrls,
    missing,
    widenedText,
    widenedImages,
    widenedMissing,
    note,
  };
}

function measure(): FrameSnap | null {
  const body = document.body;
  if (!body) return null;
  const tree = scoreTree(body, null);
  if (!tree) return null;
  const root = descend(tree);
  const wider = root.parent;
  return pack(root, wider);
}

async function extractFrame(): Promise<FrameSnap | null> {
  let snap = measure();
  const start = Date.now();
  while (
    Date.now() - start < 8000 &&
    (!snap || (snap.score < 200 && snap.imageUrls.length === 0))
  ) {
    await new Promise((r) => setTimeout(r, 400));
    snap = measure();
  }
  return snap;
}

function snapFromElement(el: HTMLElement): FrameSnap {
  const fake: Scored = {
    el,
    score: 1,
    images: [],
    parent: null,
    children: [],
  };
  const tree = scoreTree(el, null) || fake;
  const widerEl = el.parentElement;
  const wider = widerEl ? scoreTree(widerEl, null) : null;
  const snap = pack(tree, wider);
  if (isEmptyExtract(snap.text.length, snap.imageUrls.length)) {
    snap.note =
      "선택한 영역에 글자가 거의 없고, 가로 400px·세로 300px 이상인 이미지도 없습니다.";
  }
  return snap;
}

function startPick() {
  if (window.top !== window || document.getElementById("jobscrap-pick")) return;
  const bar = document.createElement("div");
  bar.id = "jobscrap-pick";
  bar.textContent = "본문으로 쓸 영역을 클릭하세요. Esc로 취소";
  bar.style.cssText =
    "position:fixed;z-index:2147483647;left:12px;top:12px;padding:8px 12px;background:#1a1a1a;color:#fff;font:13px/1.4 sans-serif;border-radius:8px";
  document.documentElement.appendChild(bar);
  let prev: { el: HTMLElement; outline: string } | null = null;
  const cleanup = () => {
    if (prev) prev.el.style.outline = prev.outline;
    bar.remove();
    document.removeEventListener("mouseover", over, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
  };
  const over = (e: MouseEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el === bar || bar.contains(el)) return;
    if (prev?.el !== el) {
      if (prev) prev.el.style.outline = prev.outline;
      prev = { el, outline: el.style.outline };
      el.style.outline = "2px solid #2f6feb";
    }
  };
  const click = (e: MouseEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el === bar || bar.contains(el)) return;
    e.preventDefault();
    e.stopPropagation();
    cleanup();
    chrome.runtime.sendMessage({
      type: "REGION_PICKED",
      snap: snapFromElement(el),
    });
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    cleanup();
    chrome.runtime.sendMessage({ type: "REGION_PICKED", cancel: true });
  };
  document.addEventListener("mouseover", over, true);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", key, true);
}

const g = globalThis as unknown as {
  __jobscrapExtract?: () => Promise<FrameSnap | null>;
  __jobscrapBound?: boolean;
};
g.__jobscrapExtract = extractFrame;

try {
  if (
    !g.__jobscrapBound &&
    typeof chrome !== "undefined" &&
    chrome.runtime?.onMessage &&
    window.top === window
  ) {
    g.__jobscrapBound = true;
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "START_PICK") {
        startPick();
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  }
} catch {
  /* ignore */
}
