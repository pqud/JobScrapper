import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { JobCard } from "../components/JobCard";
import { deleteScrap, fetchScraps, syncScrapsDemo } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { ScrapListResponse } from "../lib/types";

export function ScrapsPage() {
  const { user, token, loginDev } = useAuth();
  const [data, setData] = useState<ScrapListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData(await fetchScraps(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 8000);
    return () => clearInterval(id);
  }, [load]);

  const seedDemo = async () => {
    if (!token) return;
    await syncScrapsDemo(token, [
      {
        site: "jobkorea",
        originalId: "demo-1001",
        url: "https://www.jobkorea.co.kr/Recruit/GI_Read/1001",
        title: "백엔드 엔지니어 (데모)",
        companyName: "샘플테크",
        scrapedAt: new Date().toISOString(),
      },
      {
        site: "wanted",
        originalId: "90001",
        url: "https://www.wanted.co.kr/wd/90001",
        title: "프론트엔드 개발자 (데모)",
        companyName: "원티드샘플",
        scrapedAt: new Date().toISOString(),
      },
    ]);
    await load();
  };

  if (!user || !token) {
    return (
      <div>
        <h1 className="font-display text-3xl font-bold">내 스크랩</h1>
        <p className="mt-2 text-ink/65">로그인 후 확인할 수 있어요.</p>
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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">내 스크랩</h1>
          <p className="mt-1 text-sm text-ink/55">
            목록 동기화 후, 확장 팝업의 「브라우저로 상세 가져오기」로 본문을 채웁니다.
            (잡코리아는 서버 직접 수집이 차단됩니다)
          </p>
        </div>
        <Link to="/scraps/insights" className="text-sm font-semibold text-moss">
          키워드 인사이트 →
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-black/5 bg-white/80 px-4 py-3 text-sm">
        <span className="text-ink/70">
          마지막 동기화: {formatRelative(data?.last_synced_at)}
        </span>
        <span className="text-ink/25">|</span>
        <span className="text-ink/70">
          보강 대기 중 {data?.pending_enrichment ?? 0}건
        </span>
        <button
          onClick={() => void load()}
          className="ml-auto rounded-lg border border-black/10 px-3 py-1 text-ink/70 hover:bg-sand"
        >
          {loading ? "갱신 중…" : "⟳ 새로고침"}
        </button>
        <button
          onClick={() => void seedDemo()}
          className="rounded-lg bg-mist px-3 py-1 text-mossDark hover:bg-teal-100"
        >
          데모 데이터 넣기
        </button>
      </div>

      {error && (
        <p className="mt-4 text-sm text-red-700">
          목록을 불러오지 못했어요. 백엔드가 실행 중인지 확인해 주세요.
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {(data?.items ?? []).map((item) => (
          <JobCard
            key={item.jobId}
            item={item}
            onDelete={async (jobId) => {
              await deleteScrap(token, jobId);
              await load();
            }}
          />
        ))}
      </div>

      {data && data.items.length === 0 && !error && (
        <p className="mt-10 text-center text-ink/50">
          아직 스크랩이 없어요. 확장을 연결하거나 데모 데이터를 넣어 보세요.
        </p>
      )}
    </div>
  );
}

function formatRelative(iso?: string | null): string {
  if (!iso) return "아직 없음";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  return `${Math.floor(mins / 60)}시간 전`;
}
