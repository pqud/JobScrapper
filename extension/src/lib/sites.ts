/**
 * 스크랩 허용 사이트 — detail.path / matches만 유지.
 * 추출 스크립트는 공통 DETAIL_EXTRACT_SCRIPT.
 * manifest content_scripts.matches · host_permissions 도 같이 맞출 것.
 */

export type ScrapSite = "jobkorea" | "wanted" | "jobplanet" | "gamejob";

export const DETAIL_EXTRACT_SCRIPT = "content-scripts/detail-extract.js";

/**
 * true면 허용 URL 검사 스킵 (실험용).
 * 끝나면 false 로 되돌릴 것.
 */
export const DISABLE_SITE_GUARD = true;

export interface ScrapSiteConfig {
  id: ScrapSite;
  label: string;
  hosts: string[];
  detail?: {
    path: RegExp;
    matches: string[];
  };
  hostPermissions: string[];
}

export const SCRAP_SITES: ScrapSiteConfig[] = [
  {
    id: "jobkorea",
    label: "잡코리아",
    hosts: ["jobkorea.co.kr"],
    detail: {
      path: /\/Recruit\/GI_Read/i,
      matches: [
        "https://www.jobkorea.co.kr/Recruit/GI_Read*",
        "https://www.jobkorea.co.kr/Recruit/GI_read*",
      ],
    },
    hostPermissions: [
      "https://www.jobkorea.co.kr/*",
      "https://*.jobkorea.co.kr/*",
    ],
  },
  {
    id: "wanted",
    label: "원티드",
    hosts: ["wanted.co.kr"],
    detail: {
      path: /\/wd\/\d+/i,
      matches: ["https://www.wanted.co.kr/wd/*"],
    },
    hostPermissions: ["https://www.wanted.co.kr/*", "https://*.wanted.co.kr/*"],
  },
  {
    id: "jobplanet",
    label: "잡플래닛",
    hosts: ["jobplanet.co.kr"],
    hostPermissions: [
      "https://www.jobplanet.co.kr/*",
      "https://*.jobplanet.co.kr/*",
    ],
  },
  {
    id: "gamejob",
    label: "게임잡",
    hosts: ["gamejob.co.kr"],
    hostPermissions: [
      "https://www.gamejob.co.kr/*",
      "https://*.gamejob.co.kr/*",
    ],
  },
];

function hostMatches(hostname: string, hosts: string[]): boolean {
  const h = hostname.toLowerCase();
  return hosts.some((x) => h.includes(x.toLowerCase()));
}

export function matchDetailSite(url: string | undefined): ScrapSiteConfig | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return (
      SCRAP_SITES.find(
        (s) =>
          s.detail &&
          hostMatches(u.hostname, s.hosts) &&
          s.detail.path.test(u.pathname)
      ) ?? null
    );
  } catch {
    return null;
  }
}

export function isHttpPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function detailSitesLabel(): string {
  if (DISABLE_SITE_GUARD) return "모든 https 페이지(가드 OFF)";
  return SCRAP_SITES.filter((s) => s.detail)
    .map((s) => s.label)
    .join("·");
}
