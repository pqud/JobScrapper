import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchInsights, fetchScraps } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { InsightsResponse, ScrapItem } from "../lib/types";
import { JobCard } from "../components/JobCard";

export function InsightsPage() {
  const { user, token, loginDev } = useAuth();
  const navigate = useNavigate();
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [scraps, setScraps] = useState<ScrapItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const [i, s] = await Promise.all([
        fetchInsights(token),
        fetchScraps(token),
      ]);
      setInsights(i);
      setScraps(s.items);
    })().catch(() => {
      /* surfaced via empty state */
    });
  }, [token]);

  const max = insights?.keywords[0]?.count ?? 1;

  const filtered = useMemo(() => {
    if (!selected) return [];
    return scraps.filter(
      (item) =>
        item.job?.status === "enriched" &&
        item.job.keywords.includes(selected)
    );
  }, [scraps, selected]);

  if (!user || !token) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">키워드 인사이트</h1>
        <button
          onClick={() => loginDev()}
          className="mt-6 rounded-xl bg-moss px-4 py-2.5 text-sm font-semibold text-white"
        >
          데모 로그인
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold">키워드 인사이트</h1>
      <p className="mt-1 text-sm text-ink/55">
        스크랩한 공고에서 자주 등장하는 기술 키워드입니다. 태그를 누르면 해당
        공고만 봅니다.
      </p>

      <div className="mt-8 space-y-3">
        {(insights?.keywords ?? []).map((row) => (
          <button
            key={row.keyword}
            onClick={() =>
              setSelected((prev) => (prev === row.keyword ? null : row.keyword))
            }
            className="flex w-full items-center gap-3 text-left"
          >
            <span
              className={`w-28 shrink-0 text-sm font-medium ${
                selected === row.keyword ? "text-moss" : "text-ink/80"
              }`}
            >
              {row.keyword}
            </span>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-mist">
              <div
                className="h-full rounded-full bg-moss transition-all duration-500"
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm text-ink/50">{row.count}</span>
          </button>
        ))}
      </div>

      {insights && insights.keywords.length === 0 && (
        <p className="mt-8 text-ink/50">
          아직 집계할 키워드가 없어요.{" "}
          <button className="text-moss underline" onClick={() => navigate("/scraps")}>
            스크랩 화면
          </button>
          에서 공고를 동기화해 보세요.
        </p>
      )}

      {insights && insights.pending_count > 0 && (
        <p className="mt-6 text-sm text-ink/50">
          {insights.pending_count}건은 아직 분석 중이라 집계에 포함되지 않았어요
        </p>
      )}

      {selected && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold">
            “{selected}” 포함 공고 ({filtered.length})
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {filtered.map((item) => (
              <JobCard
                key={item.jobId}
                item={item}
                highlightKeyword={selected}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
