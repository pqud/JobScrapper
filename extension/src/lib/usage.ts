import type { AiUsageEntry, AiUsageStats } from "./types";
import { EMPTY_USAGE_STATS } from "./types";

const USAGE_KEY = "jobscrap_ai_usage";
const MAX_ENTRIES = 100;

/** USD per 1M tokens — 공개 단가 대략치. 모델명 부분 매칭. */
const PRICE_PER_M: Record<string, { in: number; out: number }> = {
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "claude-sonnet": { in: 3, out: 15 },
  "claude-haiku": { in: 0.8, out: 4 },
  "claude-opus": { in: 15, out: 75 },
};

export function estimateUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const m = model.toLowerCase();
  let price = { in: 0.15, out: 0.6 }; // default ≈ 4o-mini
  for (const [key, p] of Object.entries(PRICE_PER_M)) {
    if (m.includes(key)) {
      price = p;
      break;
    }
  }
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
}

export function getUsageStats(): Promise<AiUsageStats> {
  return chrome.storage.local.get(USAGE_KEY).then((data) => ({
    ...EMPTY_USAGE_STATS,
    ...(data[USAGE_KEY] as AiUsageStats | undefined),
  }));
}

export async function recordUsage(
  entry: Omit<AiUsageEntry, "estimatedUsd" | "totalTokens"> & {
    estimatedUsd?: number;
    totalTokens?: number;
  }
): Promise<AiUsageStats> {
  const totalTokens =
    entry.totalTokens ?? entry.inputTokens + entry.outputTokens;
  const estimatedUsd =
    entry.estimatedUsd ??
    estimateUsd(entry.model, entry.inputTokens, entry.outputTokens);
  const full: AiUsageEntry = {
    ...entry,
    totalTokens,
    estimatedUsd,
  };

  const cur = await getUsageStats();
  const entries = [full, ...cur.entries].slice(0, MAX_ENTRIES);
  const next: AiUsageStats = {
    entries,
    totalCalls: cur.totalCalls + 1,
    totalInputTokens: cur.totalInputTokens + full.inputTokens,
    totalOutputTokens: cur.totalOutputTokens + full.outputTokens,
    totalTokens: cur.totalTokens + full.totalTokens,
    totalEstimatedUsd: cur.totalEstimatedUsd + full.estimatedUsd,
  };
  await chrome.storage.local.set({ [USAGE_KEY]: next });
  return next;
}

export async function clearUsageStats(): Promise<AiUsageStats> {
  await chrome.storage.local.set({ [USAGE_KEY]: EMPTY_USAGE_STATS });
  return EMPTY_USAGE_STATS;
}
