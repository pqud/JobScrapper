import { useEffect, useMemo, useState } from "react";
import { getJobs } from "../lib/storage";
import type { AiUsageStats, StoredJob } from "../lib/types";
import { EMPTY_USAGE_STATS } from "../lib/types";
import { jobsToPostings } from "../lib/job-map";
import { CATS, catColor, type CatKey } from "../lib/tech-taxonomy";
import { clearUsageStats, getUsageStats } from "../lib/usage";
import { CardsView } from "./CardsView";
import { MatrixView } from "./MatrixView";
import { TableView, type SortDir, type SortKey } from "./TableView";
import { UsageView } from "./UsageView";
import { Chip, Empty } from "./ui";
import "./dashboard.css";

type Tab = "table" | "matrix" | "cards" | "misc";

export function Dashboard() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [usage, setUsage] = useState<AiUsageStats>(EMPTY_USAGE_STATS);
  const [tab, setTab] = useState<Tab>("table");
  const [cat, setCat] = useState<"all" | CatKey>("all");
  const [q, setQ] = useState("");
  const [tech, setTech] = useState<string | null>(null);
  const [hideExp, setHideExp] = useState(false);
  const [minMode, setMinMode] = useState("1");
  const [sortKey, setSortKey] = useState<SortKey>("dl");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [cardSort, setCardSort] = useState<"cat" | "dl">("cat");

  useEffect(() => {
    void getJobs().then(setJobs);
    void getUsageStats().then(setUsage);
    const onChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      area: string
    ) => {
      if (area !== "local") return;
      if (changes.jobscrap_jobs) void getJobs().then(setJobs);
      if (changes.jobscrap_ai_usage) void getUsageStats().then(setUsage);
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);

  const postings = useMemo(() => jobsToPostings(jobs), [jobs]);

  /** 스크랩된 직무가 있는 군만 — 빈 칩은 만들지 않음 */
  const presentCats = useMemo(
    () => CATS.filter((c) => postings.some((p) => p.cat === c.k)),
    [postings]
  );

  useEffect(() => {
    if (cat !== "all" && !presentCats.some((c) => c.k === cat)) {
      setCat("all");
    }
  }, [cat, presentCats]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return postings.filter((p) => {
      if (cat !== "all" && p.cat !== cat) return false;
      if (hideExp && p.exp) return false;
      if (tech && !p.m.has(tech)) return false;
      if (qq) {
        const hay = [p.co, p.role, p.duty, p.loc, p.pos, p.sal, p.career, ...p.m.keys()]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(qq)) return false;
      }
      return true;
    });
  }, [postings, cat, hideExp, tech, q]);

  const catSize = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of postings) m[p.cat] = (m[p.cat] || 0) + 1;
    return m;
  }, [postings]);

  const openN = postings.filter((p) => !p.exp).length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="mx-auto max-w-[1240px] px-5 pb-16 pt-7">
      <h1 className="m-0 text-[28px] font-extrabold tracking-tight">
        JobScrap 지도
      </h1>
      <p className="m-0 mt-1.5 max-w-[62ch] text-muted">
        수집·구조화된 {postings.length}개 직무(마감 전 {openN}개)입니다. 진한
        표시는 필수·사용, 연한 표시는 우대 기술입니다.
      </p>

      <div
        className="mb-3.5 mt-6 flex gap-1 border-b border-line"
        role="tablist"
        aria-label="보기 방식"
      >
        {(
          [
            ["table", "공고 표"],
            ["matrix", "공고별 기술 매트릭스"],
            ["cards", "공고 카드"],
            ["misc", "기타"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className={`-mb-px border-b-[3px] bg-transparent px-4 py-2.5 font-semibold ${
              tab === v
                ? "border-ink text-ink"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "misc" ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <Chip
            pressed={cat === "all"}
            onClick={() => setCat("all")}
            label="전체"
            count={postings.length}
          />
          {presentCats.map((c) => (
            <Chip
              key={c.k}
              pressed={cat === c.k}
              onClick={() => setCat(c.k)}
              label={c.n}
              count={catSize[c.k] || 0}
              color={catColor(c.k)}
            />
          ))}
          <span className="flex-1" />
          <input
            type="search"
            placeholder="회사·직무·기술 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="공고 검색"
            className="min-w-[200px] rounded-lg border border-line bg-surface px-2.5 py-1.5"
          />
          {tab === "matrix" ? (
            <select
              value={minMode}
              onChange={(e) => setMinMode(e.target.value)}
              aria-label="표시할 기술 기준"
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              <option value="1">모든 기술</option>
              <option value="2">2개 공고 이상</option>
              <option value="3">3개 공고 이상</option>
              <option value="5">5개 공고 이상</option>
            </select>
          ) : null}
          {tab === "cards" ? (
            <select
              value={cardSort}
              onChange={(e) => setCardSort(e.target.value as "cat" | "dl")}
              aria-label="정렬"
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              <option value="cat">직무군 순</option>
              <option value="dl">마감 임박 순</option>
            </select>
          ) : null}
          <label className="inline-flex items-center gap-1.5 text-muted">
            <input
              type="checkbox"
              checked={hideExp}
              onChange={(e) => setHideExp(e.target.checked)}
            />
            마감된 공고 숨기기
          </label>
          {tech ? (
            <button
              type="button"
              className="rounded-lg bg-ink px-2.5 py-1.5 text-page"
              onClick={() => setTech(null)}
            >
              기술: {tech} ✕
            </button>
          ) : null}
        </div>
      ) : null}

      {tab === "misc" ? (
        <UsageView
          usage={usage}
          onClear={() => {
            void clearUsageStats().then(setUsage);
          }}
        />
      ) : !postings.length ? (
        <Empty>
          아직 수집된 공고가 없습니다.
          <br />
          확장 팝업에서 잡코리아 상세 페이지를 수집해 주세요.
        </Empty>
      ) : tab === "table" ? (
        <TableView
          rows={filtered}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
        />
      ) : tab === "matrix" ? (
        <MatrixView
          rows={filtered}
          presentCats={presentCats}
          minMode={minMode}
          tech={tech}
          onTechToggle={(t) => setTech((cur) => (cur === t ? null : t))}
        />
      ) : (
        <CardsView
          rows={filtered}
          presentCats={presentCats}
          sort={cardSort}
          tech={tech}
          onTechToggle={(t) => setTech((cur) => (cur === t ? null : t))}
          onReset={() => {
            setCat("all");
            setTech(null);
            setQ("");
            setHideExp(false);
          }}
        />
      )}

      <p className="mt-5 max-w-[80ch] text-[12.5px] text-muted">
        기술 매트릭스는 keyword_extractor 기술 키워드만 표시합니다. 직무군
        칩은 스크랩된 직무명에 해당 언급이 있을 때만 나타납니다.
      </p>
    </div>
  );
}
