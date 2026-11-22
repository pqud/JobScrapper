/** template: legacy stored jobs only — extractor no longer emits it */
export type JobFormat = "article" | "template" | "image" | "unknown";

export type AiProvider = "openai" | "anthropic";

export interface ExtensionSettings {
  provider: AiProvider;
  apiKey: string;
  openaiModel: string;
  anthropicModel: string;
  useAi: boolean;
}

export interface RawJob {
  url: string;
  title: string;
  companyName: string;
  format: JobFormat;
  rawText: string;
  imageUrls: string[];
  salaryHint: string;
  locationHint: string;
  employmentHint: string;
  deadlineHint: string;
  scrapedAt: string;
  /** 추출이 남긴 이유. 실패할 때만 사용자에게 보여 준다. */
  extractNote?: string;
}

export interface StructuredRole {
  id: string;
  title: string;
  /** AI compact schema c — fe|data|ai|be|game|etc */
  cat?: string;
  duties: string[];
  required: string[];
  preferred: string[];
  skills: string[];
  /** 이 직무의 근무지. 없으면 공고 공통 location. */
  loc?: string;
  /** 신입, 경력 n년 이상. 기술 태그와 분리. */
  exp?: string;
}

export interface StoredJob {
  id: string;
  raw: RawJob;
  roles: StructuredRole[];
  selectedRoleIds: string[];
  deadline: string | null;
  salary: string | null;
  location: string | null;
  employmentType: string | null;
  /** 특이 유의사항 (희망연봉 필수 등). 일반 법적 고지는 넣지 않음. */
  notes?: string[];
  structuredAt: string | null;
  structureError: string | null;
}

export const DEFAULT_SETTINGS: ExtensionSettings = {
  provider: "openai",
  apiKey: "",
  openaiModel: "gpt-4o-mini",
  anthropicModel: "claude-haiku-5-5",
  useAi: true,
};

/** 한 번 AI 호출당 사용량 (API usage 필드 기준) */
export interface AiUsageEntry {
  at: string;
  provider: AiProvider;
  model: string;
  jobUrl: string;
  format: JobFormat;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** 단가표 기준 추정 USD (실제 청구와 다를 수 있음) */
  estimatedUsd: number;
}

export interface AiUsageStats {
  entries: AiUsageEntry[];
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalEstimatedUsd: number;
}

export const EMPTY_USAGE_STATS: AiUsageStats = {
  entries: [],
  totalCalls: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalTokens: 0,
  totalEstimatedUsd: 0,
};
