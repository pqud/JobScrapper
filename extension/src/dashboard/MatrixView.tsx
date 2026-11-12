import { Fragment } from "react";
import { dlInfo, type Posting } from "../lib/job-map";
import { CATS, catColor } from "../lib/tech-taxonomy";
import { Empty } from "./ui";

export function MatrixView({
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

  const min = Math.max(1, +minMode || 1);
  const cols = Object.keys(cnt)
    .filter((t) => cnt[t] >= min || t === tech)
    .sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b, "ko"));

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
                <Fragment key={c.k}>
                  <tr className="cg" style={{ ["--cc" as string]: catColor(c.k) }}>
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
                          <span className="rn" style={{ ["--cc" as string]: catColor(c.k) }}>
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
                                  ? `${p.co} · ${t} · ${l === 2 ? "필수·사용" : "우대"}`
                                  : undefined
                              }
                            >
                              {l ? (
                                <i
                                  className={`dot ${l === 1 ? "h" : ""}`}
                                  style={{ ["--cc" as string]: catColor(c.k) }}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
