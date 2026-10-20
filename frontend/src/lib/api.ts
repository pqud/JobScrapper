import type { InsightsResponse, ScrapListResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

async function request<T>(
  path: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchScraps(token: string) {
  return request<ScrapListResponse>("/scraps", token);
}

export function deleteScrap(token: string, jobId: string) {
  return request<{ deleted: boolean }>(`/scraps/${jobId}`, token, {
    method: "DELETE",
  });
}

export function fetchInsights(token: string) {
  return request<InsightsResponse>("/scraps/insights", token);
}

export function markExtensionConnected(
  token: string,
  email?: string | null,
  displayName?: string | null
) {
  return request<{ connected: boolean }>("/users/me/extension-connected", token, {
    method: "POST",
    body: JSON.stringify({ email, displayName }),
  });
}

export function syncScrapsDemo(
  token: string,
  items: unknown[]
) {
  return request<{ synced: number; pending_enrichment: number }>(
    "/sync/scraps",
    token,
    {
      method: "POST",
      body: JSON.stringify({ items }),
    }
  );
}
