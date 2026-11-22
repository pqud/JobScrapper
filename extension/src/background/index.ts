import { structureWithAi, toStructuredRoles } from "../lib/ai";
import type { FrameSnap } from "../content-scripts/detail-extract";
import {
  deadlineFromText,
  describeGap,
  isEmptyExtract,
  metaLines,
  placeHint,
  sectionsNeedingVision,
} from "../lib/content-root";
import {
  DETAIL_EXTRACT_SCRIPT,
  DISABLE_SITE_GUARD,
  detailSitesLabel,
  isHttpPageUrl,
  matchDetailSite,
} from "../lib/sites";
import {
  getJobs,
  getSettings,
  importJobs,
  jobIdFromUrl,
  parseJobsExport,
  removeJob,
  saveSettings,
  serializeJobsExport,
  updateJob,
  upsertJob,
} from "../lib/storage";
import type { ExtensionSettings, RawJob, StoredJob } from "../lib/types";
import { pushDebugLog } from "../lib/debug-log";
import { recordUsage } from "../lib/usage";

/** Maps/광고 iframe이 안 끝나면 allFrames executeScript가 무한 대기할 수 있다. */
function withTimeout<T>(
  p: Promise<T>,
  ms: number
): Promise<{ ok: true; value: T } | { ok: false }> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ ok: false }), ms);
    p.then(
      (value) => {
        clearTimeout(t);
        resolve({ ok: true, value });
      },
      () => {
        clearTimeout(t);
        resolve({ ok: false });
      }
    );
  });
}

async function injectExtract(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [DETAIL_EXTRACT_SCRIPT],
  });
  const all = withTimeout(
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [DETAIL_EXTRACT_SCRIPT],
    }),
    2500
  );
  const r = await all;
  if (!r.ok) {
    await pushDebugLog("inject_all_frames_timeout", { tabId });
  }
}

async function snapsFromTab(tabId: number): Promise<FrameSnap[]> {
  await injectExtract(tabId);
  const extractFn = () => {
    const fn = (
      globalThis as unknown as {
        __jobscrapExtract?: () => Promise<unknown>;
      }
    ).__jobscrapExtract;
    return fn ? fn() : null;
  };
  const top = await chrome.scripting.executeScript({
    target: { tabId },
    func: extractFn,
  });
  const all = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: extractFn,
    }),
    2500
  );
  const ran = all.ok ? all.value : top;
  if (!all.ok) await pushDebugLog("extract_all_frames_timeout", { tabId });
  return ran
    .map((r) => r.result as FrameSnap | null)
    .filter((s): s is FrameSnap => !!s && typeof s.score === "number");
}

function snapToRaw(snap: FrameSnap, pageUrl: string, widened: boolean): RawJob {
  const text = widened ? snap.widenedText || snap.text : snap.text;
  const images = widened ? snap.widenedImages : snap.imageUrls;
  const missing = widened ? snap.widenedMissing : snap.missing;
  const needVision =
    sectionsNeedingVision(missing).length > 0 && images.length > 0;
  const note = describeGap(missing, images.length, text.length);
  return {
    url: pageUrl.split("#")[0],
    title: snap.title,
    companyName: snap.companyName || "회사 미상",
    format: needVision ? "image" : text.length >= 40 ? "article" : "unknown",
    rawText: text,
    imageUrls: needVision ? images.slice(0, 5) : [],
    salaryHint: "",
    locationHint: placeHint(text),
    employmentHint: (text.match(/정규직|계약직|파견직|인턴/) || [""])[0],
    deadlineHint: deadlineFromText(text),
    scrapedAt: new Date().toISOString(),
    extractNote: note || undefined,
  };
}

async function extractFromTab(tabId: number, pageUrl: string): Promise<{
  raw: RawJob;
  wider: RawJob | null;
}> {
  const snaps = await snapsFromTab(tabId);
  if (!snaps.length) {
    throw new Error("프레임에 추출 스크립트를 넣지 못했습니다. 페이지를 새로고침한 뒤 다시 수집해 주세요.");
  }
  snaps.sort((a, b) => b.score - a.score);
  const best = mergeOutsideMeta(snaps[0], snaps);
  const top = snaps.find((s) => s.isTop);
  const company = best.companyName || top?.companyName || "";
  const title = (best.isTop ? best.title : top?.title || best.title) || best.title;
  const snap: FrameSnap = { ...best, companyName: company, title };
  if (isEmptyExtract(snap.text.length, snap.imageUrls.length)) {
    throw new Error(
      snap.note ||
        "글자가 거의 없고, 가로 400px·세로 300px 이상인 이미지도 없습니다. 영역 선택이 필요합니다."
    );
  }
  const raw = snapToRaw(snap, pageUrl, false);
  const wider =
    snap.widenedText && snap.widenedText !== snap.text
      ? snapToRaw(snap, pageUrl, true)
      : null;
  return { raw, wider };
}

function mergeOutsideMeta(best: FrameSnap, snaps: FrameSnap[]): FrameSnap {
  const bits: string[] = [];
  for (const s of snaps) {
    if (s === best) continue;
    const m = metaLines(s.text);
    if (!m || best.text.includes(m.slice(0, Math.min(20, m.length)))) continue;
    bits.push(m);
  }
  if (!bits.length) return best;
  const prefix = bits.join("\n");
  return {
    ...best,
    text: `${prefix}\n\n${best.text}`,
    widenedText: `${prefix}\n\n${best.widenedText || best.text}`,
  };
}

function tagsEmpty(job: StoredJob): boolean {
  if (job.roles.length > 1 && job.roles.every((r) => r.title.trim())) return false;
  return job.roles.every(
    (r) => !r.required.length && !r.preferred.length && !r.skills.length && !r.duties.length
  );
}

function withNote(note: string | undefined, message: string): string {
  if (!note || message.includes(note)) return message;
  return `${note} ${message}`;
}

async function runAi(job: StoredJob): Promise<StoredJob> {
  const settings = await getSettings();
  if (!settings.useAi) {
    return { ...job, structureError: job.structureError || job.raw.extractNote || null };
  }
  if (!settings.apiKey?.trim()) {
    return {
      ...job,
      structureError: withNote(job.raw.extractNote, "API 키가 없어 원문만 저장했습니다."),
    };
  }
  try {
    const { data, usage } = await structureWithAi(settings, job.raw);
    void recordUsage({
      at: new Date().toISOString(),
      provider: usage.provider,
      model: usage.model,
      jobUrl: job.raw.url,
      format: job.raw.format,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedUsd: usage.estimatedUsd,
    });
    const roles = toStructuredRoles(data);
    const aiCompany = (data.companyName || "").trim();
    const companyName =
      aiCompany && !/미상|잡코리아|원티드/i.test(aiCompany)
        ? aiCompany
        : job.raw.companyName;
    return {
      ...job,
      raw: {
        ...job.raw,
        companyName:
          companyName && !/미상/.test(companyName)
            ? companyName
            : job.raw.companyName,
      },
      roles,
      selectedRoleIds: roles.map((r) => r.id),
      deadline: data.deadline || job.deadline || job.raw.deadlineHint || null,
      salary: data.salary || job.salary || job.raw.salaryHint || null,
      location: data.location || job.location || job.raw.locationHint || null,
      employmentType:
        data.employmentType || job.employmentType || job.raw.employmentHint || null,
      notes: data.notes?.length ? data.notes : job.notes || [],
      structuredAt: new Date().toISOString(),
      structureError: null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      ...job,
      structureError: withNote(job.raw.extractNote, message),
    };
  }
}

async function structureJobIfNeeded(
  job: StoredJob,
  wider: RawJob | null = null
): Promise<StoredJob> {
  const first = await runAi(job);
  if (!first.structuredAt || !tagsEmpty(first)) return first;
  if (!wider || wider.rawText === job.raw.rawText) {
    return {
      ...first,
      structureError: withNote(
        first.raw.extractNote,
        "필수 태그(r, p)가 비었습니다. 더 넓힐 부모 영역이 없습니다. 영역 선택이 필요합니다."
      ),
    };
  }
  const second = await runAi({ ...first, raw: wider, structureError: null });
  if (!second.structuredAt) return second;
  if (tagsEmpty(second)) {
    return {
      ...second,
      structureError: withNote(
        wider.extractNote,
        "본문 범위를 한 단계 넓혀 재시도했지만 필수 태그(r, p)가 비었습니다. 영역 선택이 필요합니다."
      ),
    };
  }
  return {
    ...second,
    structureError: "필수 태그(r, p)가 비어 본문 범위를 한 단계 넓혀 다시 구조화했습니다.",
  };
}

function rawToStored(raw: RawJob): StoredJob {
  const id = jobIdFromUrl(raw.url);
  return {
    id,
    raw,
    roles: [
      {
        id: "role-0",
        title: raw.title || "기본 직무",
        duties: [],
        required: [],
        preferred: [],
        skills: [],
      },
    ],
    selectedRoleIds: ["role-0"],
    deadline: raw.deadlineHint || null,
    salary: raw.salaryHint || null,
    location: raw.locationHint || null,
    employmentType: raw.employmentHint || null,
    structuredAt: null,
    structureError: null,
  };
}

type PendingRegion = {
  tabId: number;
  url: string;
  snap: FrameSnap;
};

export type PendingRegionView = {
  tabId: number;
  url: string;
  title: string;
  companyName: string;
  preview: string;
  textLen: number;
  imageCount: number;
  note: string | null;
};

const PENDING_KEY = "pendingRegion";

/** SW 재시작 대비. local이 session보다 안정적. */
let pendingMemory: PendingRegion | null = null;

function pageKey(url: string): string {
  return url.split("#")[0];
}

function toPendingView(p: PendingRegion): PendingRegionView {
  const text = p.snap.text || "";
  return {
    tabId: p.tabId,
    url: p.url,
    title: p.snap.title || "",
    companyName: p.snap.companyName || "",
    preview: text.replace(/\s+/g, " ").trim().slice(0, 160),
    textLen: text.length,
    imageCount: p.snap.imageUrls.length,
    note: p.snap.note,
  };
}

async function setBadge(tabId: number | undefined, on: boolean): Promise<void> {
  if (tabId == null) return;
  try {
    if (on) {
      await chrome.action.setBadgeText({ tabId, text: "선택" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2f6feb" });
    } else {
      await chrome.action.setBadgeText({ tabId, text: "" });
    }
  } catch {
    /* ignore */
  }
}

async function setPendingRegion(p: PendingRegion | null): Promise<void> {
  const prevTab = pendingMemory?.tabId;
  pendingMemory = p;
  try {
    if (p) await chrome.storage.local.set({ [PENDING_KEY]: p });
    else await chrome.storage.local.remove(PENDING_KEY);
  } catch {
    /* memory만으로라도 같은 SW에선 동작 */
  }
  if (prevTab != null && prevTab !== p?.tabId) await setBadge(prevTab, false);
  await setBadge(p?.tabId ?? prevTab, !!p);
}

async function getPendingRegion(): Promise<PendingRegion | null> {
  if (pendingMemory?.snap && typeof pendingMemory.tabId === "number") {
    return pendingMemory;
  }
  try {
    const data = await chrome.storage.local.get(PENDING_KEY);
    const p = data[PENDING_KEY] as PendingRegion | undefined;
    if (p?.snap && typeof p.tabId === "number") {
      pendingMemory = p;
      return p;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function activeHttpTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}

async function clearPickOnTab(tabId: number): Promise<void> {
  const stopFn = () => {
    const g = globalThis as unknown as {
      __jobscrapStopPick?: () => void;
      __jobscrapClearPick?: () => void;
    };
    (g.__jobscrapStopPick || g.__jobscrapClearPick)?.();
  };
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: stopFn,
    });
  } catch {
    /* tab may be gone */
  }
  const all = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: stopFn,
    }),
    1500
  );
  if (!all.ok) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "CLEAR_PICK" });
    } catch {
      /* ignore */
    }
  }
}

type PickFrameResult = {
  started?: boolean;
  reason?: string;
  href?: string;
  isTop?: boolean;
};

async function startPickOnTab(tabId: number): Promise<PickFrameResult[]> {
  await injectExtract(tabId);
  const startFn = () => {
    const g = globalThis as unknown as {
      __jobscrapStartPick?: () => { started: boolean; reason: string };
    };
    if (typeof g.__jobscrapStartPick !== "function") {
      return {
        started: false,
        reason: "no_fn",
        href: location.href,
        isTop: window.top === window,
      };
    }
    const r = g.__jobscrapStartPick();
    return {
      ...r,
      href: location.href,
      isTop: window.top === window,
    };
  };
  // top 먼저 — maps 등 외부 iframe 때문에 allFrames가 걸려도 선택 UI는 뜬다
  const top = await chrome.scripting.executeScript({
    target: { tabId },
    func: startFn,
  });
  const topResults = top
    .map((x) => x.result as PickFrameResult | null)
    .filter((x): x is PickFrameResult => !!x);
  if (topResults.some((r) => r.started)) return topResults;

  // top이 큰 iframe 때문에 건너뛴 경우에만 하위 프레임 시도
  const all = await withTimeout(
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: startFn,
    }),
    2500
  );
  if (!all.ok) {
    await pushDebugLog("pick_all_frames_timeout", { tabId });
    return topResults;
  }
  return all.value
    .map((x) => x.result as PickFrameResult | null)
    .filter((x): x is PickFrameResult => !!x);
}

async function collectFromSnap(
  snap: FrameSnap,
  pageUrl: string
): Promise<{ ok: boolean; job?: StoredJob; error?: string }> {
  if (isEmptyExtract(snap.text.length, snap.imageUrls.length)) {
    return {
      ok: false,
      error:
        snap.note ||
        "선택한 영역에 글자가 거의 없고, 큰 이미지도 없습니다. 다른 영역을 선택해 주세요.",
    };
  }
  const raw = snapToRaw(snap, pageUrl, false);
  const wider =
    snap.widenedText && snap.widenedText !== snap.text
      ? snapToRaw(snap, pageUrl, true)
      : null;
  let job = rawToStored(raw);
  job = await structureJobIfNeeded(job, wider);
  await upsertJob(job);
  return { ok: true, job };
}

async function collectCurrentTab(): Promise<{
  ok: boolean;
  job?: StoredJob;
  error?: string;
}> {
  const settings = await getSettings();
  if (!settings.apiKey?.trim()) {
    return { ok: false, error: "API 키를 먼저 입력해 주세요." };
  }
  const tab = await activeHttpTab();
  if (!tab?.id || !tab.url) {
    return { ok: false, error: "활성 탭이 없습니다." };
  }
  if (!isHttpPageUrl(tab.url)) {
    return { ok: false, error: "http(s) 페이지에서만 수집할 수 있습니다." };
  }
  if (!DISABLE_SITE_GUARD && !matchDetailSite(tab.url)?.detail) {
    return {
      ok: false,
      error: `${detailSitesLabel()} 채용 상세 페이지에서 실행해 주세요.`,
    };
  }
  try {
    const pending = await getPendingRegion();
    if (pending && pending.tabId === tab.id) {
      return collectFromSnap(pending.snap, tab.url);
    }
    const { raw, wider } = await extractFromTab(tab.id, tab.url);
    let job = rawToStored(raw);
    job = await structureJobIfNeeded(job, wider);
    await upsertJob(job);
    return { ok: true, job };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "수집 실패. 페이지를 새로고침 후 다시 시도해 주세요.",
    };
  }
}

/** 실제 AI 수집만 잠근다. 영역 선택은 잠그지 않는다. */
let collectLock = false;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "DEBUG_LOG") {
    void pushDebugLog(
      String(message.event || "log"),
      (message.detail as Record<string, unknown>) || undefined
    ).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "PICK_REGION") {
    void (async () => {
      const tab = await activeHttpTab();
      if (!tab?.id || !tab.url || !isHttpPageUrl(tab.url)) {
        await pushDebugLog("pick_region_bad_tab", { url: tab?.url || null });
        sendResponse({ ok: false, error: "http(s) 페이지에서만 영역을 고를 수 있습니다." });
        return;
      }
      try {
        await pushDebugLog("pick_region_start", {
          tabId: tab.id,
          url: pageKey(tab.url),
        });
        const frames = await startPickOnTab(tab.id);
        const started = frames.filter((f) => f.started);
        await pushDebugLog("pick_region_frames", {
          tabId: tab.id,
          frames,
          startedCount: started.length,
        });
        if (!started.length) {
          const reasons = frames.map((f) => f.reason || "?").join(", ");
          sendResponse({
            ok: false,
            error: `영역 선택 UI를 띄우지 못했습니다 (${reasons || "no_frames"}). 페이지를 새로고침한 뒤 다시 시도해 주세요.`,
            frames,
          });
          return;
        }
        sendResponse({ ok: true, frames, startedCount: started.length });
      } catch (e) {
        const err =
          e instanceof Error ? e.message : "영역 선택을 시작하지 못했습니다.";
        await pushDebugLog("pick_region_error", { error: err });
        sendResponse({ ok: false, error: err });
      }
    })();
    return true;
  }

  if (message.type === "REGION_PICKED") {
    void (async () => {
      if (message.cancel) {
        sendResponse({ ok: false, error: "영역 선택을 취소했습니다." });
        return;
      }
      const snap = message.snap as FrameSnap | undefined;
      const tabId = _sender.tab?.id;
      const pageUrl = _sender.tab?.url || snap?.href || "";
      if (!snap || tabId == null || !pageUrl || !isHttpPageUrl(pageUrl)) {
        sendResponse({ ok: false, error: "선택한 영역의 페이지 주소를 알 수 없습니다." });
        return;
      }
      if (isEmptyExtract(snap.text.length, snap.imageUrls.length)) {
        sendResponse({
          ok: false,
          error:
            snap.note ||
            "선택한 영역에 글자가 거의 없고, 큰 이미지도 없습니다. 다른 영역을 선택해 주세요.",
        });
        return;
      }
      const pending: PendingRegion = {
        tabId,
        url: pageKey(pageUrl),
        snap,
      };
      await setPendingRegion(pending);
      sendResponse({ ok: true, pending: toPendingView(pending) });
    })();
    return true;
  }

  if (message.type === "GET_PENDING_REGION") {
    void (async () => {
      const tab = await activeHttpTab();
      const pending = await getPendingRegion();
      if (!tab?.id || !pending || pending.tabId !== tab.id) {
        sendResponse({ ok: true, pending: null });
        return;
      }
      sendResponse({ ok: true, pending: toPendingView(pending) });
    })();
    return true;
  }

  if (message.type === "CLEAR_REGION") {
    void (async () => {
      const pending = await getPendingRegion();
      await setPendingRegion(null);
      if (pending) await clearPickOnTab(pending.tabId);
      else {
        const tab = await activeHttpTab();
        if (tab?.id) await clearPickOnTab(tab.id);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "COLLECT_CURRENT") {
    if (collectLock) {
      sendResponse({ ok: false, error: "이미 수집 중입니다. 잠시만 기다려 주세요." });
      return false;
    }
    collectLock = true;
    void collectCurrentTab()
      .then(sendResponse)
      .finally(() => {
        collectLock = false;
      });
    return true;
  }

  if (message.type === "GET_JOBS") {
    void getJobs().then((jobs) => sendResponse({ ok: true, jobs }));
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    void getSettings().then((settings) =>
      sendResponse({ ok: true, settings })
    );
    return true;
  }

  if (message.type === "SAVE_SETTINGS") {
    void saveSettings(message.patch as Partial<ExtensionSettings>).then(
      (settings) => sendResponse({ ok: true, settings })
    );
    return true;
  }

  if (message.type === "REMOVE_JOB") {
    void removeJob(message.id).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.type === "TOGGLE_ROLE") {
    void (async () => {
      const jobs = await getJobs();
      const job = jobs.find((j) => j.id === message.jobId);
      if (!job) {
        sendResponse({ ok: false });
        return;
      }
      const set = new Set(job.selectedRoleIds);
      if (message.on) set.add(message.roleId);
      else set.delete(message.roleId);
      const updated = await updateJob(job.id, {
        selectedRoleIds: [...set],
      });
      sendResponse({ ok: true, job: updated });
    })();
    return true;
  }

  if (message.type === "RESTRUCTURE_JOB") {
    void (async () => {
      const jobs = await getJobs();
      const job = jobs.find((j) => j.id === message.id);
      if (!job) {
        sendResponse({ ok: false, error: "not_found" });
        return;
      }
      const next = await structureJobIfNeeded({
        ...job,
        structureError: null,
      });
      await upsertJob(next);
      sendResponse({ ok: true, job: next });
    })();
    return true;
  }

  if (message.type === "EXPORT_JSON") {
    void getJobs().then((jobs) =>
      sendResponse({ ok: true, json: serializeJobsExport(jobs) })
    );
    return true;
  }

  if (message.type === "IMPORT_JSON") {
    void (async () => {
      try {
        const jobs = parseJobsExport(String(message.json || ""));
        const mode = message.mode === "replace" ? "replace" : "merge";
        const result = await importJobs(jobs, mode);
        sendResponse({ ok: true, ...result });
      } catch (e) {
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : "가져오기에 실패했습니다.",
        });
      }
    })();
    return true;
  }

  return false;
});
