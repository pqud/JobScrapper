import { dlInfo, salTxt, type Posting } from "../lib/job-map";
import { CATS, catColor } from "../lib/tech-taxonomy";
import { DlBadge, Empty } from "./ui";

export function CardsView({
  rows,
  presentCats,
  sort,
  tech,
  onTechToggle,
  onReset,
  onRemoveRole,
}: {
  rows: Posting[];
  presentCats: typeof CATS;
  sort: "cat" | "dl";
  tech: string | null;
  onTechToggle: (t: string) => void;
  onReset: () => void;
  onRemoveRole: (jobId: string, roleId: string) => void;
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

  const sorted = [...rows];
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
        const when = /시(?!간)|\d:\d{2}/.test(p.dl) ? p.dl : "";
        const meta = [p.pos, p.career, p.loc, sal, when].filter(Boolean);
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
            {p.notes.length ? (
              <div className="rounded-md border border-[#e8d9a8] bg-[#fff8e6] px-2.5 py-2">
                <div className="text-[11px] font-bold text-[#8a6d00]">유의사항</div>
                <ul className="m-0 mt-1 list-disc pl-4 text-[12.5px] leading-snug text-[#5c4a10]">
                  {p.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </div>
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
            <div className="mt-auto flex items-center justify-between gap-2">
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="text-[13px] text-inherit"
              >
                공고 링크 열기
              </a>
              <button
                type="button"
                className="border-0 bg-transparent p-0 text-[12px] text-[#c44] cursor-pointer"
                onClick={() => {
                  if (
                    confirm(
                      `${p.co} · ${p.role || "직무"} 를 지도에서 삭제할까요?`
                    )
                  ) {
                    onRemoveRole(p.jobId, p.id.slice(p.jobId.length + 2));
                  }
                }}
              >
                이 직무 삭제
              </button>
            </div>
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
