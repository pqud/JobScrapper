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

export function jobIdFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const gi =
      u.searchParams.get("GI_No") ||
      u.searchParams.get("gi_no") ||
      u.pathname.match(/GI_Read\/(\d+)/i)?.[1];
    return `jk-${gi || btoa(url).slice(0, 24)}`;
  } catch {
    return `jk-${Date.now()}`;
  }
}
