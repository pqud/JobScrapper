import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type StoredJob,
} from "./types";

const SETTINGS_KEY = "jobscrap_settings";
const JOBS_KEY = "jobscrap_jobs";

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data[SETTINGS_KEY] || {}) };
}

/** Serialize settings writes so concurrent patches (key + checkbox) don't wipe each other. */
let settingsSaveChain: Promise<unknown> = Promise.resolve();

export function saveSettings(
  patch: Partial<ExtensionSettings>
): Promise<ExtensionSettings> {
  const run = async () => {
    const cur = await getSettings();
    const next = { ...cur, ...patch };
    await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    return next;
  };
  const next = settingsSaveChain.then(run, run);
  settingsSaveChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function getJobs(): Promise<StoredJob[]> {
  const data = await chrome.storage.local.get(JOBS_KEY);
  return (data[JOBS_KEY] as StoredJob[]) || [];
}

export async function upsertJob(job: StoredJob): Promise<StoredJob[]> {
  const jobs = await getJobs();
  const i = jobs.findIndex((j) => j.id === job.id || j.raw.url === job.raw.url);
  if (i >= 0) jobs[i] = job;
  else jobs.unshift(job);
  await chrome.storage.local.set({ [JOBS_KEY]: jobs.slice(0, 200) });
  return jobs;
}

export async function updateJob(
  id: string,
  patch: Partial<StoredJob>
): Promise<StoredJob | null> {
  const jobs = await getJobs();
  const i = jobs.findIndex((j) => j.id === id);
  if (i < 0) return null;
  jobs[i] = { ...jobs[i], ...patch };
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return jobs[i];
}

export async function removeJob(id: string): Promise<void> {
  const jobs = (await getJobs()).filter((j) => j.id !== id);
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
}

/** 한 공고 안의 직무(role)만 제거. 마지막이면 공고 전체 삭제. */
export async function removeRole(
  jobId: string,
  roleId: string
): Promise<StoredJob[]> {
  const jobs = await getJobs();
  const i = jobs.findIndex((j) => j.id === jobId);
  if (i < 0) return jobs;
  const job = jobs[i];
  const roles = job.roles.filter((r) => r.id !== roleId);
  if (!roles.length) {
    jobs.splice(i, 1);
  } else {
    jobs[i] = {
      ...job,
      roles,
      selectedRoleIds: job.selectedRoleIds.filter((id) => id !== roleId),
    };
  }
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return jobs;
}

/** Stable id from posting URL. Do not truncate btoa — shared prefixes collide. */
export function jobIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, "");
    const jk =
      u.searchParams.get("GI_No") ||
      u.searchParams.get("gi_no") ||
      path.match(/GI_Read\/(\d+)/i)?.[1];
    if (jk) return `jk-${jk}`;
    const wd = path.match(/\/wd\/(\d+)/i)?.[1];
    if (wd) return `wd-${wd}`;
    const key = `${u.hostname}${path}${u.search}`;
    let h = 0;
    for (let i = 0; i < key.length; i++) {
      h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
    }
    return `u-${(h >>> 0).toString(36)}`;
  } catch {
    return `u-${Date.now()}`;
  }
}

export type JobsExportFile = {
  version: number;
  exportedAt: string;
  jobs: StoredJob[];
};

export function serializeJobsExport(jobs: StoredJob[]): string {
  const payload: JobsExportFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    jobs,
  };
  return JSON.stringify(payload, null, 2);
}

function isStoredJob(v: unknown): v is StoredJob {
  if (!v || typeof v !== "object") return false;
  const j = v as StoredJob;
  return (
    typeof j.id === "string" &&
    !!j.raw &&
    typeof j.raw.url === "string" &&
    typeof j.raw.title === "string" &&
    Array.isArray(j.roles)
  );
}

/** 내보내기 JSON → StoredJob[]. {version,jobs} 또는 jobs 배열만도 허용. */
export function parseJobsExport(raw: string): StoredJob[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON 파싱에 실패했습니다.");
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as JobsExportFile).jobs)
      ? (data as JobsExportFile).jobs
      : null;
  if (!list) throw new Error("jobs 배열이 없습니다.");
  const jobs = list.filter(isStoredJob);
  if (!jobs.length) throw new Error("가져올 공고가 없습니다.");
  return jobs.slice(0, 200);
}

export type ImportJobsResult = {
  added: number;
  updated: number;
  total: number;
  jobs: StoredJob[];
};

/** merge: id/url 같으면 덮어씀. replace: 파일 내용으로 교체. */
export async function importJobs(
  incoming: StoredJob[],
  mode: "merge" | "replace" = "merge"
): Promise<ImportJobsResult> {
  if (mode === "replace") {
    const jobs = incoming.slice(0, 200);
    await chrome.storage.local.set({ [JOBS_KEY]: jobs });
    return { added: jobs.length, updated: 0, total: jobs.length, jobs };
  }
  const cur = await getJobs();
  let added = 0;
  let updated = 0;
  const next = [...cur];
  for (const job of incoming) {
    const i = next.findIndex((j) => j.id === job.id || j.raw.url === job.raw.url);
    if (i >= 0) {
      next[i] = job;
      updated += 1;
    } else {
      next.unshift(job);
      added += 1;
    }
  }
  const jobs = next.slice(0, 200);
  await chrome.storage.local.set({ [JOBS_KEY]: jobs });
  return { added, updated, total: jobs.length, jobs };
}

export function downloadTextFile(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
