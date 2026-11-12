/**
 * 모든 프레임에서 본문 루트를 고른다.
 * 글자 수(링크 안은 20%) + 큰 이미지 면적. nav/footer만 제외. aside는 포함.
 * 본문으로 내려가면 형제인 상단 줄(header, 마감·건물)은 텍스트 앞에 붙인다.
 * 자식 하나가 부모 점수의 70% 이상이면 그 자식으로 내려간다.
 */

import {
  describeGap,
  imageCharScore,
  isEmptyExtract,
  metaLines,
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

function outsideText(el: HTMLElement, root: HTMLElement): string {
  if (el === root || !el.contains(root)) return el.innerText || "";
  const clone = el.cloneNode(true) as HTMLElement;
  const indices: number[] = [];
  let cur: HTMLElement | null = root;
  while (cur && cur !== el) {
    const parent: HTMLElement | null = cur.parentElement;
    if (!parent) return "";
    indices.push([...parent.children].indexOf(cur));
    cur = parent;
  }
  let target: Element | null = clone;
  for (const i of indices.reverse()) target = target?.children[i] || null;
  target?.remove();
  return clone.innerText || "";
}

function metaBeside(root: Scored): string {
  const chunks: string[] = [];
  const seen = new Set<HTMLElement>();
  const take = (el: HTMLElement) => {
    if (seen.has(el) || el === root.el) return;
    if (el.matches("nav, footer, [role=navigation]")) return;
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return;
    seen.add(el);
    const lines = metaLines(outsideText(el, root.el));
    if (lines) chunks.push(lines);
  };
  document.querySelectorAll("header").forEach((el) => {
    if (el instanceof HTMLElement) take(el);
  });
  let node: Scored | null = root;
  while (node?.parent) {
    for (const sib of node.parent.children) {
      if (sib !== node) take(sib.el);
    }
    node = node.parent;
  }
  return [...new Set(chunks)].join("\n");
}

function withMeta(root: Scored, body: string): string {
  const extra = metaBeside(root);
  if (!extra || body.includes(extra.slice(0, 24))) return body;
  return `${extra}\n\n${body}`;
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
  const text = withMeta(root, cleanText(root.el));
  const imageUrls = [...new Set(root.images)].slice(0, 5);
  const missing = missingSections(text);
  const widenedText = wider ? withMeta(root, cleanText(wider.el)) : text;
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

const PICK_BAR_ID = "jobscrap-pick";
const PICKED_BAR_ID = "jobscrap-picked";
const PICKED_OUTLINE = "2px solid #2f6feb";

let lockedPick: { el: HTMLElement; outline: string } | null = null;

function clearLockedPick() {
  if (lockedPick) {
    lockedPick.el.style.outline = lockedPick.outline;
    lockedPick = null;
  }
  document.getElementById(PICKED_BAR_ID)?.remove();
}

function showPickedBar() {
  if (!lockedPick || document.getElementById(PICKED_BAR_ID)) return;
  const bar = document.createElement("div");
  bar.id = PICKED_BAR_ID;
  bar.textContent = "영역 선택됨 · 확장 팝업에서「현재 영역 수집」";
  bar.style.cssText =
    "position:fixed;z-index:2147483647;left:12px;top:12px;padding:8px 12px;background:#1a1a1a;color:#fff;font:13px/1.4 sans-serif;border-radius:8px;max-width:min(420px,90vw)";
  document.documentElement.appendChild(bar);
}

function lockPick(el: HTMLElement, savedOutline: string) {
  clearLockedPick();
  lockedPick = { el, outline: savedOutline };
  el.style.outline = PICKED_OUTLINE;
  showPickedBar();
}

function startPick() {
  if (window.top !== window || document.getElementById(PICK_BAR_ID)) return;
  document.getElementById(PICKED_BAR_ID)?.remove();
  const bar = document.createElement("div");
  bar.id = PICK_BAR_ID;
  bar.textContent = "본문으로 쓸 영역을 클릭하세요. Esc로 취소";
  bar.style.cssText =
    "position:fixed;z-index:2147483647;left:12px;top:12px;padding:8px 12px;background:#1a1a1a;color:#fff;font:13px/1.4 sans-serif;border-radius:8px";
  document.documentElement.appendChild(bar);
  let prev: { el: HTMLElement; outline: string } | null = null;
  const cleanup = () => {
    if (prev) {
      if (lockedPick && prev.el === lockedPick.el) {
        prev.el.style.outline = PICKED_OUTLINE;
      } else {
        prev.el.style.outline = prev.outline;
      }
      prev = null;
    }
    bar.remove();
    document.removeEventListener("mouseover", over, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", key, true);
  };
  const over = (e: MouseEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el === bar || bar.contains(el)) return;
    if (prev?.el !== el) {
      if (prev) {
        if (lockedPick && prev.el === lockedPick.el) {
          prev.el.style.outline = PICKED_OUTLINE;
        } else {
          prev.el.style.outline = prev.outline;
        }
      }
      const base =
        lockedPick && el === lockedPick.el ? lockedPick.outline : el.style.outline;
      prev = { el, outline: base };
      el.style.outline = PICKED_OUTLINE;
    }
  };
  const click = (e: MouseEvent) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el === bar || bar.contains(el)) return;
    e.preventDefault();
    e.stopPropagation();
    const savedOutline =
      lockedPick && el === lockedPick.el
        ? lockedPick.outline
        : prev?.el === el
          ? prev.outline
          : el.style.outline;
    if (prev) {
      if (lockedPick && prev.el === lockedPick.el) {
        prev.el.style.outline = PICKED_OUTLINE;
      } else {
        prev.el.style.outline = prev.outline;
      }
      prev = null;
    }
    cleanup();
    const snap = snapFromElement(el);
    // MV3: 응답을 기다려야 SW가 storage 쓰기 전에 죽지 않는다.
    chrome.runtime.sendMessage({ type: "REGION_PICKED", snap }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        clearLockedPick();
        const err =
          chrome.runtime.lastError?.message ||
          res?.error ||
          "영역 저장에 실패했습니다.";
        const fail = document.createElement("div");
        fail.id = PICKED_BAR_ID;
        fail.textContent = err;
        fail.style.cssText =
          "position:fixed;z-index:2147483647;left:12px;top:12px;padding:8px 12px;background:#7a1f1f;color:#fff;font:13px/1.4 sans-serif;border-radius:8px;max-width:min(420px,90vw)";
        document.documentElement.appendChild(fail);
        setTimeout(() => fail.remove(), 4000);
        return;
      }
      lockPick(el, savedOutline);
    });
  };
  const key = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    cleanup();
    showPickedBar();
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
      if (message?.type === "CLEAR_PICK") {
        clearLockedPick();
        sendResponse({ ok: true });
        return false;
      }
      return false;
    });
  }
} catch {
  /* ignore */
}
