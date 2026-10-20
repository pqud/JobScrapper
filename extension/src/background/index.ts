import { structureWithAi, toStructuredRoles } from "../lib/ai";
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function extractFromTab(
  tabId: number,
  timeoutMs = 14000
): Promise<RawJob> {
  // 공통 detail-extract: 본문 텍스트 → 없으면 공고 이미지 (iframe 포함)
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: [DETAIL_EXTRACT_SCRIPT],
    });
  } catch {
    /* may already be injected or page not matchable */
  }
  await sleep(600);
  const res = await chrome.tabs.sendMessage(tabId, {
    type: "EXTRACT_RAW",
    timeoutMs,
  });
  if (!res?.ok || !res.raw) {
    throw new Error(res?.error || "extract_failed");
  }
  return res.raw as RawJob;
}

async function structureJobIfNeeded(job: StoredJob): Promise<StoredJob> {
  const settings = await getSettings();
  if (!settings.useAi) return job;
  if (!settings.apiKey?.trim()) {
    return {
      ...job,
      structureError: "API 키가 없어 원문만 저장했습니다.",
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
      deadline: job.deadline || job.raw.deadlineHint || null,
      salary: job.salary || job.raw.salaryHint || null,
      location: job.location || job.raw.locationHint || null,
      employmentType: job.employmentType || job.raw.employmentHint || null,
      structuredAt: new Date().toISOString(),
      structureError: null,
    };
  } catch (e) {
    return {
      ...job,
      structureError: e instanceof Error ? e.message : String(e),
    };
  }
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

async function collectCurrentTab(): Promise<{
  ok: boolean;
  job?: StoredJob;
  error?: string;
}> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
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
    const raw = await extractFromTab(tab.id);
    let job = rawToStored(raw);
    job = await structureJobIfNeeded(job);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
