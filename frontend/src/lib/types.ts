export type Site = "jobkorea" | "wanted" | "jobplanet" | "gamejob";
export type JobStatus = "pending" | "enriched" | "failed";

export interface SourceInfo {
  site: Site;
  originalId: string;
  url: string;
  postedAt?: string | null;
}

export interface Job {
  id: string;
  status: JobStatus;
  title: string;
  companyNameRaw: string;
  companyId?: string | null;
  keywords: string[];
  sources: SourceInfo[];
  description?: string | null;
  createdAt?: string | null;
  enrichedAt?: string | null;
}

export interface ScrapItem {
  jobId: string;
  scrapedAt?: string | null;
  job?: Job | null;
}

export interface ScrapListResponse {
  items: ScrapItem[];
  pending_enrichment: number;
  last_synced_at?: string | null;
}

export interface KeywordCount {
  keyword: string;
  count: number;
}

export interface InsightsResponse {
  keywords: KeywordCount[];
  pending_count: number;
  enriched_count: number;
}
