import type { StoredJob } from "./types";
import {
  extractKeywords,
  isTechKeyword,
  TECH_KEYWORDS,
} from "./keyword-extractor";
import { inferCat, isCatKey, type CatKey } from "./tech-taxonomy";

function canonTag(s: string): string {
  const lower = s.toLowerCase();
  return TECH_KEYWORDS.find((k) => k.toLowerCase() === lower) || s;
}

export type Posting = {
  id: string;
  jobId: string;
  co: string;
  role: string;
  loc: string;
  sal: string;
  dl: string;
  pos: string;
  cat: CatKey;
  duty: string;
  reqL: string[];
  prefL: string[];
  /** skill → 2 req, 1 pref */
  m: Map<string, 1 | 2>;
  url: string;
  d: Date | null;
  days: number | null;
  exp: boolean;
};

const TODAY = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
})();

function parseDeadline(s: string | null | undefined): {
  label: string;
  date: Date | null;
} {
  const raw = (s || "").trim();
  if (!raw || /상시|채용시|수시|상시채용/.test(raw)) {
    return { label: "상시", date: null };
  }
  const m =
    raw.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})/) ||
    raw.match(/(\d{4})\.(\d{2})\.(\d{2})/);
  if (m) {
    const date = new Date(+m[1], +m[2] - 1, +m[3]);
    date.setHours(0, 0, 0, 0);
    const label = `${m[1]}.${String(m[2]).padStart(2, "0")}.${String(m[3]).padStart(2, "0")}`;
    return { label, date };
  }
  return { label: raw.slice(0, 24), date: null };
}

/**
 * AI compact 스키마는 이미 영문 표준 기술명.
 * 구버전 자유문 required/skills만 extractKeywords로 정규화.
 * duties(x)는 비기술 태그 → 매트릭스에 넣지 않음.
 */
function collectSkills(
  required: string[],
  preferred: string[],
  skills: string[]
): { reqL: string[]; prefL: string[]; m: Map<string, 1 | 2> } {
  const m = new Map<string, 1 | 2>();
  const add = (list: string[], level: 1 | 2) => {
    for (const raw of list) {
      const s = String(raw || "").trim();
      if (!s) continue;
      const tags = isTechKeyword(s) ? [canonTag(s)] : extractKeywords(s);
      for (const kw of tags) {
        const prev = m.get(kw) || 0;
        if (level > prev) m.set(kw, level);
      }
    }
  };
  add(preferred, 1);
  add(required, 2);
  add(skills, 2); // legacy rows
  const reqL = [...m].filter(([, l]) => l === 2).map(([t]) => t);
  const prefL = [...m].filter(([, l]) => l === 1).map(([t]) => t);
  return { reqL, prefL, m };
}

export function jobsToPostings(jobs: StoredJob[]): Posting[] {
  const out: Posting[] = [];
  for (const job of jobs) {
    const roles =
      job.roles.length > 0
        ? job.roles
        : [
            {
              id: "role-0",
              title: job.raw.title || "기본 직무",
              duties: [],
              required: [],
              preferred: [],
              skills: [],
            },
          ];
    const { label: dl, date: d } = parseDeadline(
      job.deadline || job.raw.deadlineHint
    );
    const days =
      d != null ? Math.round((d.getTime() - TODAY.getTime()) / 864e5) : null;
    const exp = days !== null && days < 0;

    for (const role of roles) {
      const { reqL, prefL, m } = collectSkills(
        role.required,
        role.preferred,
        role.skills
      );
      const roleTitle = role.title || job.raw.title || "";
      const cat = isCatKey(role.cat)
        ? role.cat
        : inferCat(roleTitle, [...reqL, ...prefL]);
      out.push({
        id: `${job.id}::${role.id}`,
        jobId: job.id,
        co: job.raw.companyName || "회사 미상",
        role: roleTitle,
        loc: job.location || job.raw.locationHint || "",
        sal: job.salary || job.raw.salaryHint || "",
        dl,
        pos: job.employmentType || job.raw.employmentHint || "",
        cat,
        duty: role.duties.slice(0, 3).join(" · "),
        reqL,
        prefL,
        m,
        url: job.raw.url,
        d,
        days,
        exp,
      });
    }
  }
  return out;
}

export function dlInfo(p: Posting): { t: string; c: string } {
  if (!p.d) return { t: "상시채용", c: "always" };
  if (p.days != null && p.days > 0)
    return { t: `D-${p.days}`, c: p.days <= 3 ? "urgent" : "" };
  if (p.days === 0) return { t: "오늘 마감", c: "urgent" };
  return { t: `마감 (${p.dl})`, c: "always" };
}

export function salTxt(p: Posting): string {
  if (!p.sal) return "";
  if (/월|만\s*원|연봉/.test(p.sal)) return p.sal;
  if (/^\d/.test(p.sal)) return `연봉 ${p.sal}`;
  return p.sal;
}
