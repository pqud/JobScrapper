import React, { useEffect, useMemo, useState } from "react";
import { getJobs } from "../lib/storage";
import type { AiUsageStats, StoredJob } from "../lib/types";
import { EMPTY_USAGE_STATS } from "../lib/types";
import {
  dlInfo,
  jobsToPostings,
  salTxt,
  type Posting,
} from "../lib/job-map";
import { GROUP_NAMES, techGroup } from "../lib/keyword-extractor";
import {
  CATS,
  catColor,
  type CatKey,
} from "../lib/tech-taxonomy";
import { clearUsageStats, getUsageStats } from "../lib/usage";
import "./dashboard.css";

type Tab = "table" | "matrix" | "cards" | "misc";
type SortKey = "co" | "loc" | "sal" | "dl" | "role";
type SortDir = "asc" | "desc";

function fmtUsd(n: number): string {
  if (n < 0.0001 && n > 0) return "<$0.0001";
  return `$${n.toFixed(n < 0.01 ? 4 : 3)}`;
}

export function Dashboard() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [usage, setUsage] = useState<AiUsageStats>(EMPTY_USAGE_STATS);
  const [tab, setTab] = useState<Tab>("table");
  const [cat, setCat] = useState<"all" | CatKey>("all");
  const [q, setQ] = useState("");
  const [tech, setTech] = useState<string | null>(null);
  const [hideExp, setHideExp] = useState(false);
  const [minMode, setMinMode] = useState("auto");
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
        const hay = [p.co, p.role, p.duty, p.loc, p.pos, p.sal, ...p.m.keys()]
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
              <option value="auto">기술 자동 선택</option>
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

function UsageView({
  usage,
  onClear,
}: {
  usage: AiUsageStats;
  onClear: () => void;
}) {
  const avgTok =
    usage.totalCalls > 0 ? Math.round(usage.totalTokens / usage.totalCalls) : 0;
  const avgUsd =
    usage.totalCalls > 0 ? usage.totalEstimatedUsd / usage.totalCalls : 0;

  return (
    <div className="space-y-4">
      <p className="m-0 text-[13px] text-muted">
        AI 구조화 호출마다 API가 돌려준 토큰 수를 기록합니다. 비용은 공개
        단가표로 추정한 값이며, 실제 청구서와 다를 수 있습니다.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["총 호출", `${usage.totalCalls}회`],
          ["총 토큰", usage.totalTokens.toLocaleString()],
          ["총 추정 비용", fmtUsd(usage.totalEstimatedUsd)],
          ["1회 평균", `${avgTok.toLocaleString()} tok · ${fmtUsd(avgUsd)}`],
        ].map(([k, v]) => (
          <div
            key={k}
            className="rounded-[10px] border border-line bg-surface px-4 py-3"
          >
            <div className="text-[12px] text-muted">{k}</div>
            <div className="mt-1 text-lg font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-base font-bold">최근 호출 (최대 100)</h2>
        <button
          type="button"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px]"
          onClick={onClear}
          disabled={!usage.totalCalls}
        >
          기록 초기화
        </button>
      </div>
      {!usage.entries.length ? (
        <Empty>아직 기록된 AI 호출이 없습니다. 공고를 수집하면 여기에 쌓입니다.</Empty>
      ) : (
        <div className="overflow-auto rounded-[10px] border border-line bg-surface">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {["시각", "모델", "포맷", "입력", "출력", "합계", "추정 $", "URL"].map(
                  (h) => (
                    <th
                      key={h}
                      className="sticky top-0 bg-surface px-3 py-2 text-left font-bold"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {usage.entries.map((e, i) => (
                <tr key={`${e.at}-${i}`} className="hover:bg-soft">
                  <td className="border-t border-line px-3 py-2 whitespace-nowrap text-muted">
                    {e.at.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="border-t border-line px-3 py-2">{e.model}</td>
                  <td className="border-t border-line px-3 py-2">{e.format}</td>
                  <td className="border-t border-line px-3 py-2 tabular-nums">
                    {e.inputTokens.toLocaleString()}
                  </td>
                  <td className="border-t border-line px-3 py-2 tabular-nums">
                    {e.outputTokens.toLocaleString()}
                  </td>
                  <td className="border-t border-line px-3 py-2 tabular-nums font-semibold">
                    {e.totalTokens.toLocaleString()}
                  </td>
                  <td className="border-t border-line px-3 py-2 tabular-nums">
                    {fmtUsd(e.estimatedUsd)}
                  </td>
                  <td className="border-t border-line px-3 py-2 max-w-[220px] truncate">
                    <a
                      href={e.jobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-inherit"
                      title={e.jobUrl}
                    >
                      {e.jobUrl.replace(/^https?:\/\//, "").slice(0, 40)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  label,
  count,
  color,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${
        pressed
          ? "border-ink bg-ink text-page"
          : "border-line bg-surface text-ink"
      }`}
    >
      {color ? (
        <i
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
        />
      ) : null}
      {label}{" "}
      <small className={pressed ? "opacity-75" : "text-muted"}>{count}</small>
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line bg-surface px-9 py-9 text-center text-muted">
      {children}
    </div>
  );
}

function TableView({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: Posting[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const cmpStr = (a: string, b: string) =>
      a.localeCompare(b, "ko") * dir || 0;
    return [...rows].sort((a, b) => {
      if (sortKey === "dl") {
        const ra = a.exp ? 3 : a.d ? 0 : 1;
        const rb = b.exp ? 3 : b.d ? 0 : 1;
        if (ra !== rb) return (ra - rb) * dir;
        if (a.d && b.d) return (a.d.getTime() - b.d.getTime()) * dir;
        return cmpStr(a.dl, b.dl);
      }
      if (sortKey === "co") return cmpStr(a.co, b.co);
      if (sortKey === "loc") return cmpStr(a.loc, b.loc);
      if (sortKey === "sal") return cmpStr(a.sal, b.sal);
      return cmpStr(a.role, b.role);
    });
  }, [rows, sortKey, sortDir]);

  const mark = (k: SortKey) =>
    sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : "";

  const cols: { key: SortKey; label: string }[] = [
    { key: "co", label: "회사 명" },
    { key: "loc", label: "위치" },
    { key: "sal", label: "연봉" },
    { key: "dl", label: "마감일자" },
    { key: "role", label: "직무 이름" },
  ];

  return (
    <div className="overflow-auto rounded-[10px] border border-line bg-surface">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className="sticky top-0 z-[1] cursor-pointer select-none whitespace-nowrap bg-surface px-3 py-2.5 text-left font-bold hover:bg-soft"
                onClick={() => onSort(c.key)}
              >
                {c.label}
                <span className="ml-1 font-medium text-muted">{mark(c.key)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const di = dlInfo(p);
            return (
              <tr key={p.id} className="hover:bg-soft">
                <td className="border-b border-line px-3 py-2.5 align-top">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-inherit no-underline hover:underline"
                  >
                    {p.co}
                  </a>
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  {p.loc || <span className="text-muted">—</span>}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  {salTxt(p) || <span className="text-muted">—</span>}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  <DlBadge info={di} />
                  {p.dl && p.d ? (
                    <div className="text-[11px] text-muted">{p.dl}</div>
                  ) : null}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  {p.role || <span className="text-muted">—</span>}
                </td>
              </tr>
            );
          })}
          {!sorted.length ? (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted">
                조건에 맞는 공고가 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function DlBadge({ info }: { info: { t: string; c: string } }) {
  const color =
    info.c === "urgent"
      ? "text-warn font-bold"
      : info.c === "always"
        ? "font-medium text-muted"
        : "font-bold";
  return (
    <span className={`whitespace-nowrap tabular-nums text-[13px] ${color}`}>
      {info.t}
    </span>
  );
}

function MatrixView({
  rows,
  presentCats,
  minMode,
  tech,
  onTechToggle,
}: {
  rows: Posting[];
  presentCats: typeof CATS;
  minMode: string;
  tech: string | null;
  onTechToggle: (t: string) => void;
}) {
  if (!rows.length) {
    return <Empty>조건에 맞는 공고가 없습니다.</Empty>;
  }

  const cnt: Record<string, number> = {};
  for (const p of rows) for (const t of p.m.keys()) cnt[t] = (cnt[t] || 0) + 1;

  let min = minMode === "auto" ? (rows.length <= 12 ? 2 : 3) : +minMode;
  let cols = Object.keys(cnt).filter((t) => cnt[t] >= min || t === tech);
  if (!cols.length) {
    min = 1;
    cols = Object.keys(cnt);
  }
  cols.sort(
    (a, b) =>
      GROUP_NAMES.indexOf(techGroup(a)) - GROUP_NAMES.indexOf(techGroup(b)) ||
      cnt[b] - cnt[a] ||
      a.localeCompare(b, "ko")
  );

  const spans: { g: string; n: number }[] = [];
  for (const t of cols) {
    const g = techGroup(t);
    const last = spans[spans.length - 1];
    if (last && last.g === g) last.n++;
    else spans.push({ g, n: 1 });
  }

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-3.5 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <i
            className="mx-dot inline-block h-4 w-4 rounded"
            style={{ ["--cc" as string]: "#2f6feb", background: "#2f6feb" }}
          />
          필수·사용
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i
            className="inline-block h-4 w-4 rounded border-[1.5px]"
            style={{
              borderColor: "#2f6feb",
              background: "color-mix(in srgb, #2f6feb 22%, white)",
            }}
          />
          우대
        </span>
        <span>
          기술만 표시 · 현재 {rows.length}개 공고, {cols.length}개 기술
        </span>
      </div>
      <div className="mx-wrap">
        <table className="mx">
          <thead>
            <tr className="r1">
              <th className="rl" />
              {spans.map((s) => (
                <th key={s.g + s.n} colSpan={s.n}>
                  {s.g}
                </th>
              ))}
            </tr>
            <tr className="r2">
              <th className="rl" />
              {cols.map((t) => (
                <th key={t} className={t === tech ? "hl" : ""}>
                  <button
                    type="button"
                    className="rot"
                    title={t}
                    onClick={() => onTechToggle(t)}
                  >
                    <span>{t}</span>
                  </button>
                </th>
              ))}
            </tr>
            <tr className="r3">
              <th className="rl" style={{ textAlign: "left", paddingLeft: 12 }}>
                공고 수
              </th>
              {cols.map((t) => (
                <th key={t} className={t === tech ? "hl" : ""}>
                  {cnt[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {presentCats.map((c) => {
              const rs = rows.filter((p) => p.cat === c.k);
              if (!rs.length) return null;
              return (
                <React.Fragment key={c.k}>
                  <tr
                    className="cg"
                    style={{ ["--cc" as string]: catColor(c.k) }}
                  >
                    <td colSpan={cols.length + 1}>
                      <span>
                        <i
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{ background: catColor(c.k) }}
                        />
                        {c.n} ({rs.length})
                      </span>
                    </td>
                  </tr>
                  {rs.map((p) => {
                    const di = dlInfo(p);
                    return (
                      <tr key={p.id}>
                        <th className="rl" scope="row">
                          <span
                            className="rn"
                            style={{ ["--cc" as string]: catColor(c.k) }}
                          >
                            <b>{p.co}</b>
                            <span>
                              {p.role || "상세 정보 없음"} · {di.t}
                            </span>
                          </span>
                        </th>
                        {cols.map((t) => {
                          const l = p.m.get(t);
                          return (
                            <td
                              key={t}
                              className={t === tech ? "hl" : ""}
                              title={
                                l
                                  ? `${p.co} · ${t} · ${
                                      l === 2 ? "필수·사용" : "우대"
                                    }`
                                  : undefined
                              }
                            >
                              {l ? (
                                <i
                                  className={`dot ${l === 1 ? "h" : ""}`}
                                  style={{
                                    ["--cc" as string]: catColor(c.k),
                                  }}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CardsView({
  rows,
  presentCats,
  sort,
  tech,
  onTechToggle,
  onReset,
}: {
  rows: Posting[];
  presentCats: typeof CATS;
  sort: "cat" | "dl";
  tech: string | null;
  onTechToggle: (t: string) => void;
  onReset: () => void;
}) {
  if (!rows.length) {
    return (
      <Empty>
        조건에 맞는 공고가 없어요.
        <br />
        <button
          type="button"
          className="mt-2.5 rounded-lg border border-ink bg-transparent px-3 py-1"
          onClick={onReset}
        >
          필터 모두 지우기
        </button>
      </Empty>
    );
  }

  let sorted = [...rows];
  if (sort === "dl") {
    const rank = (p: Posting) => (p.exp ? 3 : p.d ? 0 : 1);
    sorted.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.d && b.d ? a.d.getTime() - b.d.getTime() : 0)
    );
  } else {
    sorted.sort(
      (a, b) =>
        presentCats.findIndex((c) => c.k === a.cat) -
          presentCats.findIndex((c) => c.k === b.cat) ||
        a.co.localeCompare(b.co, "ko")
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
      {sorted.map((p) => {
        const di = dlInfo(p);
        const sal = salTxt(p);
        const meta = [p.pos, p.loc, sal].filter(Boolean);
        const cc = catColor(p.cat);
        return (
          <article
            key={p.id}
            className={`flex flex-col gap-2 rounded-[10px] border border-line border-l-[5px] bg-surface px-4 py-3.5 ${
              p.exp ? "opacity-60" : ""
            }`}
            style={{ borderLeftColor: cc }}
          >
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-base font-extrabold tracking-tight">
                {p.co}
              </span>
              <DlBadge info={di} />
            </div>
            {p.role ? <h3 className="m-0 font-semibold">{p.role}</h3> : null}
            {meta.length ? (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-muted">
                {meta.map((x) => (
                  <span key={x}>{x}</span>
                ))}
              </div>
            ) : null}
            {p.duty ? (
              <p className="m-0 text-[13px] text-muted">{p.duty}</p>
            ) : null}
            {p.reqL.length ? (
              <TechRow
                label="필수·사용"
                tags={p.reqL}
                tech={tech}
                color={cc}
                hollow={false}
                onTechToggle={onTechToggle}
              />
            ) : null}
            {p.prefL.length ? (
              <TechRow
                label="우대"
                tags={p.prefL}
                tech={tech}
                color={cc}
                hollow
                onTechToggle={onTechToggle}
              />
            ) : null}
            {!p.reqL.length && !p.prefL.length ? (
              <p className="m-0 text-[13px] text-muted">
                기술 키워드가 명시되지 않은 공고예요.
              </p>
            ) : null}
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] text-inherit"
            >
              공고 링크 열기
            </a>
          </article>
        );
      })}
    </div>
  );
}

function TechRow({
  label,
  tags,
  tech,
  color,
  hollow,
  onTechToggle,
}: {
  label: string;
  tags: string[];
  tech: string | null;
  color: string;
  hollow: boolean;
  onTechToggle: (t: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-[58px] shrink-0 text-xs text-muted">{label}</span>
      {tags.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onTechToggle(t)}
          className={`rounded-md px-2 py-0.5 text-[12.5px] leading-relaxed ${
            t === tech ? "outline outline-2 outline-ink outline-offset-1" : ""
          }`}
          style={
            hollow
              ? {
                  border: `1px solid ${color}`,
                  background: `color-mix(in srgb, ${color} 14%, var(--color-surface))`,
                  color: "var(--color-ink)",
                }
              : {
                  border: `1px solid ${color}`,
                  background: color,
                  color: "#fff",
                }
          }
        >
          {t}
        </button>
      ))}
    </div>
  );
}
