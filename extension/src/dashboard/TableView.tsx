import { useMemo } from "react";
import { dlInfo, salTxt, type Posting } from "../lib/job-map";
import { DlBadge } from "./ui";

export type SortKey = "co" | "loc" | "sal" | "dl" | "role" | "career";
export type SortDir = "asc" | "desc";

export function TableView({
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
      if (sortKey === "career") return cmpStr(a.career, b.career);
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
    { key: "career", label: "경력" },
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
                  {p.career || <span className="text-muted">—</span>}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  {p.role || <span className="text-muted">—</span>}
                </td>
              </tr>
            );
          })}
          {!sorted.length ? (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-muted">
                조건에 맞는 공고가 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
