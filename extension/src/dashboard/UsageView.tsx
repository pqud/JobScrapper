import type { DebugLogEntry } from "../lib/debug-log";
import type { AiUsageStats } from "../lib/types";
import { Empty } from "./ui";

function fmtUsd(n: number): string {
  if (n < 0.0001 && n > 0) return "<$0.0001";
  return `$${n.toFixed(n < 0.01 ? 4 : 3)}`;
}

export function UsageView({
  usage,
  onClear,
  debugLogs,
  onClearDebug,
}: {
  usage: AiUsageStats;
  onClear: () => void;
  debugLogs: DebugLogEntry[];
  onClearDebug: () => void;
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

      <div className="flex items-center justify-between gap-2 pt-2">
        <h2 className="m-0 text-base font-bold">영역 선택 디버그 로그</h2>
        <button
          type="button"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px]"
          onClick={onClearDebug}
          disabled={!debugLogs.length}
        >
          로그 초기화
        </button>
      </div>
      <p className="m-0 text-[12px] text-muted">
        pick_region_frames / pick_skip_frame / pick_overlay_on / pick_move 순으로
        보면, 어느 프레임에 오버레이가 걸렸는지 추적할 수 있습니다.
      </p>
      {!debugLogs.length ? (
        <Empty>아직 디버그 로그가 없습니다. 영역 선택을 한 번 실행해 보세요.</Empty>
      ) : (
        <div className="overflow-auto rounded-[10px] border border-line bg-surface max-h-[360px]">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {["시각", "이벤트", "상세"].map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 bg-surface px-3 py-2 text-left font-bold"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {debugLogs.map((e, i) => (
                <tr key={`${e.at}-${e.event}-${i}`} className="hover:bg-soft align-top">
                  <td className="border-t border-line px-3 py-2 whitespace-nowrap text-muted">
                    {e.at.replace("T", " ").slice(0, 19)}
                  </td>
                  <td className="border-t border-line px-3 py-2 font-semibold">
                    {e.event}
                  </td>
                  <td className="border-t border-line px-3 py-2 font-mono break-all">
                    {e.detail ? JSON.stringify(e.detail) : "—"}
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
