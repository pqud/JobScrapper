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
  onRemoveRole,
}: {
  rows: Posting[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  onRemoveRole: (jobId: string, roleId: string) => void;
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

  const roleIdOf = (p: Posting) => p.id.slice(p.jobId.length + 2);

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
            <th className="sticky top-0 z-[1] whitespace-nowrap bg-surface px-3 py-2.5 text-left font-bold">
              삭제
            </th>
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
                  <div>{p.role || <span className="text-muted">—</span>}</div>
                  {p.notes.length ? (
                    <div
                      className="mt-1 text-[11px] leading-snug text-[#8a6d00]"
                      title={p.notes.join("\n")}
                    >
                      유의 · {p.notes[0]}
                      {p.notes.length > 1 ? ` 외 ${p.notes.length - 1}` : ""}
                    </div>
                  ) : null}
                </td>
                <td className="border-b border-line px-3 py-2.5 align-top">
                  <button
                    type="button"
                    className="border-0 bg-transparent p-0 text-[12px] text-[#c44] cursor-pointer"
                    onClick={() => {
                      if (
                        confirm(
                          `${p.co} · ${p.role || "직무"} 를 지도에서 삭제할까요?`
                        )
                      ) {
                        onRemoveRole(p.jobId, roleIdOf(p));
                      }
                    }}
                  >
                    삭제
                  </button>
                </td>
              </tr>
            );
          })}
          {!sorted.length ? (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted">
                조건에 맞는 공고가 없습니다.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
