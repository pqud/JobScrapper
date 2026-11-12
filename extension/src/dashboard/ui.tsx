import type { ReactNode } from "react";
import { dlInfo } from "../lib/job-map";

export function Chip({
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

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line bg-surface px-9 py-9 text-center text-muted">
      {children}
    </div>
  );
}

export function DlBadge({ info }: { info: ReturnType<typeof dlInfo> }) {
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
