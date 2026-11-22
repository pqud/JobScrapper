/** 영역 선택·수집 추적 로그. 지도(대시보드) 사용량 탭에서 본다. */

export type DebugLogEntry = {
  at: string;
  event: string;
  detail?: Record<string, unknown>;
};

const KEY = "jobscrap_debug_log";
const MAX = 80;

export async function pushDebugLog(
  event: string,
  detail?: Record<string, unknown>
): Promise<void> {
  const entry: DebugLogEntry = {
    at: new Date().toISOString(),
    event,
    ...(detail ? { detail } : {}),
  };
  try {
    const data = await chrome.storage.local.get(KEY);
    const prev = Array.isArray(data[KEY]) ? (data[KEY] as DebugLogEntry[]) : [];
    await chrome.storage.local.set({ [KEY]: [entry, ...prev].slice(0, MAX) });
  } catch {
    /* ignore */
  }
}

export async function getDebugLogs(): Promise<DebugLogEntry[]> {
  try {
    const data = await chrome.storage.local.get(KEY);
    return Array.isArray(data[KEY]) ? (data[KEY] as DebugLogEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearDebugLogs(): Promise<void> {
  await chrome.storage.local.remove(KEY);
}
