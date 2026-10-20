import type { Job, ScrapItem } from "../lib/types";

const SITE_LABEL: Record<string, string> = {
  jobkorea: "잡코리아",
  wanted: "원티드",
  jobplanet: "잡플래닛",
  gamejob: "게임잡",
};

interface Props {
  item: ScrapItem;
  onDelete?: (jobId: string) => void;
  highlightKeyword?: string | null;
}

export function JobCard({ item, onDelete, highlightKeyword }: Props) {
  const job = item.job;
  if (!job) return null;

  if (job.status === "pending") {
    return (
      <article className="rounded-2xl border border-black/5 bg-white/80 p-5">
        <div className="skeleton mb-3 h-5 w-2/3 rounded" />
        <div className="skeleton mb-4 h-4 w-1/3 rounded" />
        <p className="text-sm text-ink/55">상세 정보를 가져오는 중이에요</p>
        <p className="mt-2 text-sm font-medium text-ink/80">{job.title}</p>
        <p className="text-sm text-ink/50">{job.companyNameRaw}</p>
      </article>
    );
  }

  if (job.status === "failed") {
    const url = job.sources[0]?.url;
    return (
      <article className="rounded-2xl border border-amber-200/80 bg-amber-50/60 p-5">
        <h3 className="font-semibold">{job.title}</h3>
        <p className="text-sm text-ink/60">{job.companyNameRaw}</p>
        <p className="mt-3 text-sm text-ink/70">상세 정보를 가져오지 못했어요</p>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm font-semibold text-moss underline-offset-2 hover:underline"
          >
            원문 링크로 바로가기
          </a>
        )}
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-black/5 bg-white/90 p-5 shadow-sm shadow-black/5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-snug">{job.title}</h3>
          <p className="mt-1 text-sm text-ink/60">{job.companyNameRaw}</p>
        </div>
        {onDelete && (
          <button
            onClick={() => onDelete(job.id)}
            className="text-xs text-ink/40 hover:text-ink/70"
            aria-label="스크랩 삭제"
          >
            삭제
          </button>
        )}
      </div>
      <SourceBadge job={job} />
      {job.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.keywords.map((kw) => (
            <span
              key={kw}
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                highlightKeyword === kw
                  ? "bg-moss text-white"
                  : "bg-mist text-mossDark"
              }`}
            >
              {kw}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

function SourceBadge({ job }: { job: Job }) {
  if (job.sources.length === 0) return null;
  const labels = job.sources.map((s) => SITE_LABEL[s.site] ?? s.site);
  return (
    <p className="mt-2 text-xs text-ink/45">
      {labels.join(" · ")}에서 스크랩됨
    </p>
  );
}
