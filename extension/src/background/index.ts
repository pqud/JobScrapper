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
  jobIdFromUrl,
  removeJob,
  saveSettings,
  updateJob,
  upsertJob,
} from "../lib/storage";
import type { ExtensionSettings, RawJob, StoredJob } from "../lib/types";
import { recordUsage } from "../lib/usage";

async function injectExtract(tabId: number): Promise<void> {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [DETAIL_EXTRACT_SCRIPT],
    });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [DETAIL_EXTRACT_SCRIPT],
    });
  }
}

async function snapsFromTab(tabId: number): Promise<FrameSnap[]> {
  await injectExtract(tabId);
  let ran: chrome.scripting.InjectionResult[];
  try {
    ran = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: () => {
        const fn = (
          globalThis as unknown as {
            __jobscrapExtract?: () => Promise<unknown>;
          }
        ).__jobscrapExtract;
        return fn ? fn() : null;
      },
    });
  } catch {
    ran = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const fn = (
          globalThis as unknown as {
            __jobscrapExtract?: () => Promise<unknown>;
          }
        ).__jobscrapExtract;
        return fn ? fn() : null;
      },
    });
  }
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

/** SW가 storage await 전에 죽어도 같은 생애주기 안에서는 살아 있게 */
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

async function setPendingRegion(p: PendingRegion | null): Promise<void> {
  pendingMemory = p;
  try {
    if (p) await chrome.storage.session.set({ [PENDING_KEY]: p });
    else await chrome.storage.session.remove(PENDING_KEY);
  } catch {
    // session 실패해도 memory로 같은 SW 생애 안에서는 수집 가능
  }
}

async function getPendingRegion(): Promise<PendingRegion | null> {
  if (pendingMemory?.snap && typeof pendingMemory.tabId === "number") {
    return pendingMemory;
  }
  try {
    const data = await chrome.storage.session.get(PENDING_KEY);
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
  try {
    await chrome.tabs.sendMessage(tabId, { type: "CLEAR_PICK" });
  } catch {
    /* tab may be gone */
  }
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

/** 팝업 더블클릭 등으로 AI가 중복 호출되지 않게 */
let collectLock = false;
let pickTimer: ReturnType<typeof setTimeout> | undefined;

function armPickTimeout() {
  if (pickTimer) clearTimeout(pickTimer);
  pickTimer = setTimeout(() => {
    collectLock = false;
    pickTimer = undefined;
  }, 90000);
}

function clearPickTimeout() {
  if (pickTimer) clearTimeout(pickTimer);
  pickTimer = undefined;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PICK_REGION") {
    if (collectLock) {
      sendResponse({ ok: false, error: "이미 수집 중입니다. 잠시만 기다려 주세요." });
      return false;
    }
    collectLock = true;
    void (async () => {
      const tab = await activeHttpTab();
      if (!tab?.id || !tab.url || !isHttpPageUrl(tab.url)) {
        collectLock = false;
        sendResponse({ ok: false, error: "http(s) 페이지에서만 영역을 고를 수 있습니다." });
        return;
      }
      try {
        await injectExtract(tab.id);
        await chrome.tabs.sendMessage(tab.id, { type: "START_PICK" });
        armPickTimeout();
        sendResponse({ ok: true });
      } catch (e) {
        collectLock = false;
        sendResponse({
          ok: false,
          error: e instanceof Error ? e.message : "영역 선택을 시작하지 못했습니다.",
        });
      }
    })();
    return true;
  }

  if (message.type === "REGION_PICKED") {
    void (async () => {
      try {
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
        // 콘텐츠 스크립트가 응답을 기다리므로, storage까지 쓴 뒤 응답한다.
        await setPendingRegion(pending);
        sendResponse({ ok: true, pending: toPendingView(pending) });
      } finally {
        clearPickTimeout();
        collectLock = false;
      }
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
      sendResponse({
        ok: true,
        json: JSON.stringify(
          { version: 1, exportedAt: new Date().toISOString(), jobs },
          null,
          2
        ),
      })
    );
    return true;
  }

  return false;
});
