import React, { useCallback, useEffect, useState } from "react";
import type {
  AiProvider,
  ExtensionSettings,
  StoredJob,
} from "../lib/types";
import { DEFAULT_SETTINGS } from "../lib/types";

export function Popup() {
  const [settings, setSettings] =
    useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const refreshJobs = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_JOBS" }, (res) => {
      if (res?.jobs) setJobs(res.jobs);
    });
  }, []);

  const loadSettings = useCallback(() => {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (res) => {
      if (res?.settings) setSettings(res.settings);
    });
  }, []);

  useEffect(() => {
    loadSettings();
    refreshJobs();
  }, [loadSettings, refreshJobs]);

  const saveSettings = (patch: Partial<ExtensionSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    chrome.runtime.sendMessage(
      { type: "SAVE_SETTINGS", patch },
      (res) => {
        // Keep typed apiKey if storage echo is empty during race
        if (res?.settings) {
          setSettings((prev) => ({
            ...res.settings,
            apiKey: res.settings.apiKey || prev.apiKey || patch.apiKey || "",
          }));
        }
      }
    );
  };

  const persistKeyNow = (apiKey: string) => {
    setSettings((prev) => ({ ...prev, apiKey }));
    chrome.runtime.sendMessage({ type: "SAVE_SETTINGS", patch: { apiKey } });
  };

  const onCollect = () => {
    if (busy) return;
    // Ensure key is flushed before AI call
    if (settings.apiKey) persistKeyNow(settings.apiKey);
    setBusy(true);
    setStatus("현재 탭 수집 중…");
    chrome.runtime.sendMessage({ type: "COLLECT_CURRENT" }, (res) => {
      setBusy(false);
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "수집 실패");
        return;
      }
      if (!res?.ok) {
        setStatus(res?.error || "수집 실패");
        return;
      }
      setStatus(
        res.job?.structureError
          ? `저장됨 (구조화 경고: ${res.job.structureError})`
          : `저장됨 · ${res.job?.raw?.title?.slice(0, 40) || "완료"}`
      );
      refreshJobs();
    });
  };

  const onPick = () => {
    if (busy) return;
    setBusy(true);
    setStatus("영역 선택 준비 중…");
    chrome.runtime.sendMessage({ type: "PICK_REGION" }, (res) => {
      setBusy(false);
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "영역 선택을 시작하지 못했습니다.");
        return;
      }
      setStatus(
        res?.ok
          ? "페이지에서 본문 영역을 클릭하세요. Esc로 취소."
          : res?.error || "영역 선택을 시작하지 못했습니다."
      );
    });
  };

  const onExport = () => {
    chrome.runtime.sendMessage({ type: "EXPORT_JSON" }, (res) => {
      if (!res?.json) return;
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobscrap-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("JSON 내보냄");
    });
  };

  const onRemove = (id: string) => {
    chrome.runtime.sendMessage({ type: "REMOVE_JOB", id }, () =>
      refreshJobs()
    );
  };

  const onRestructure = (id: string) => {
    if (busy) return;
    if (settings.apiKey) persistKeyNow(settings.apiKey);
    setBusy(true);
    setStatus("AI 구조화 중…");
    chrome.runtime.sendMessage({ type: "RESTRUCTURE_JOB", id }, (res) => {
      setBusy(false);
      if (chrome.runtime.lastError) {
        setStatus(chrome.runtime.lastError.message || "구조화 실패");
        return;
      }
      if (!res?.ok) {
        setStatus(res?.error || "구조화 실패");
        return;
      }
      setStatus(
        res.job?.structureError
          ? `경고: ${res.job.structureError}`
          : "구조화 완료"
      );
      refreshJobs();
    });
  };

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <strong>JobScrap</strong>
        <button
          type="button"
          style={s.linkBtn}
          onClick={() =>
            chrome.tabs.create({
              url: chrome.runtime.getURL("dashboard/index.html"),
            })
          }
        >
          지도 열기
        </button>
      </header>

      <section style={s.card}>
        <label style={s.label}>
          <input
            type="checkbox"
            checked={settings.useAi}
            onChange={(e) => saveSettings({ useAi: e.target.checked })}
          />{" "}
          AI로 구조화
        </label>
        <div style={s.row}>
          <select
            value={settings.provider}
            onChange={(e) =>
              saveSettings({ provider: e.target.value as AiProvider })
            }
            style={s.select}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
          <button
            type="button"
            style={s.linkBtn}
            onClick={() => setShowKey((v) => !v)}
          >
            {showKey ? "키 숨기기" : "API 키"}
          </button>
        </div>
        {showKey ? (
          <input
            type="password"
            placeholder="API Key (입력 즉시 저장)"
            value={settings.apiKey}
            onChange={(e) => persistKeyNow(e.target.value)}
            style={s.input}
          />
        ) : null}
        {!showKey && settings.apiKey ? (
          <span style={s.muted}>API 키 저장됨 · {settings.apiKey.slice(0, 8)}…</span>
        ) : null}
      </section>

      <section style={s.card}>
        <button
          type="button"
          style={{
            ...s.primary,
            ...(busy ? s.btnDisabled : null),
          }}
          disabled={busy}
          aria-busy={busy}
          onClick={onCollect}
        >
          {busy ? "수집 중…" : "현재 탭 수집"}
        </button>
        {status.includes("영역 선택") ||
        status.includes("영역을 클릭") ||
        jobs.some((j) => j.structureError?.includes("영역 선택")) ? (
          <button type="button" style={s.linkBtn} disabled={busy} onClick={onPick}>
            영역 선택
          </button>
        ) : null}
      </section>

      {status ? <p style={s.status}>{status}</p> : null}

      <section style={s.card}>
        <div style={s.rowBetween}>
          <strong style={{ fontSize: 13 }}>저장됨 {jobs.length}</strong>
          <button type="button" style={s.linkBtn} onClick={onExport}>
            JSON 내보내기
          </button>
        </div>
        <ul style={s.list}>
          {jobs.slice(0, 30).map((job) => {
            const open = openId === job.id;
            return (
              <li key={job.id} style={s.item}>
                <button
                  type="button"
                  style={s.jobHead}
                  onClick={() => setOpenId(open ? null : job.id)}
                >
                  <span style={s.jobHeadText}>
                    {job.raw.companyName} · {job.raw.title.slice(0, 42)}
                  </span>
                  <span style={s.muted}>{open ? "접기 ▲" : "상세 ▼"}</span>
                </button>
                <div style={s.meta}>
                  {job.roles.length} roles
                  {job.structureError ? " ⚠" : ""}
                </div>
                {open ? <JobDetail job={job} /> : null}
                <div style={s.row}>
                  <a
                    href={job.raw.url}
                    target="_blank"
                    rel="noreferrer"
                    style={s.linkBtn}
                  >
                    원문
                  </a>
                  <button
                    type="button"
                    style={{
                      ...s.linkBtn,
                      ...(busy ? s.btnDisabled : null),
                    }}
                    disabled={busy}
                    onClick={() => onRestructure(job.id)}
                  >
                    {busy ? "처리 중…" : "다시 구조화"}
                  </button>
                  <button
                    type="button"
                    style={s.danger}
                    onClick={() => onRemove(job.id)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            );
          })}
          {!jobs.length ? (
            <li style={s.muted}>아직 공고가 없습니다.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function bullets(label: string, items: string[]) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontWeight: 600, fontSize: 11, color: "#555" }}>{label}</div>
      <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
        {items.map((x, i) => (
          <li key={i} style={{ fontSize: 11, lineHeight: 1.4 }}>
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

function JobDetail({ job }: { job: StoredJob }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <div style={s.detail}>
      <div style={s.detailMeta}>
        {[
          job.location && `근무지: ${job.location}`,
          job.employmentType && `고용: ${job.employmentType}`,
          job.deadline && `마감: ${job.deadline}`,
          job.salary && `급여: ${job.salary}`,
        ]
          .filter(Boolean)
          .join(" · ") || "메타 없음"}
      </div>
      {job.structureError ? (
        <div style={{ ...s.status, margin: "4px 0" }}>{job.structureError}</div>
      ) : null}
      {job.roles.map((r) => (
        <div key={r.id} style={s.roleBlock}>
          <div style={{ fontWeight: 700, fontSize: 12 }}>{r.title}</div>
          {bullets("담당업무", r.duties)}
          {bullets("자격요건", r.required)}
          {bullets("우대", r.preferred)}
          {bullets("스킬", r.skills)}
          {!r.duties.length && !r.required.length && !r.preferred.length ? (
            <div style={s.muted}>구조화된 항목 없음</div>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        style={s.linkBtn}
        onClick={() => setShowRaw((v) => !v)}
      >
        {showRaw ? "원문 숨기기" : "수집 원문 보기"}
      </button>
      {showRaw ? (
        <pre style={s.rawBox}>{job.raw.rawText.slice(0, 6000)}</pre>
      ) : null}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    width: 360,
    maxHeight: 560,
    overflow: "auto",
    padding: 12,
    fontFamily:
      'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 13,
    color: "#1a1a1a",
    background: "#f7f7f5",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10,
  },
  muted: { color: "#888", fontSize: 11 },
  card: {
    background: "#fff",
    border: "1px solid #e8e8e4",
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  label: { display: "flex", alignItems: "center", gap: 6, fontSize: 12 },
  row: { display: "flex", gap: 8, alignItems: "center" },
  rowBetween: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  select: {
    flex: 1,
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #ddd",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid #ddd",
  },
  primary: {
    padding: "8px 10px",
    borderRadius: 6,
    border: "none",
    background: "#1a1a1a",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
  },
  btnDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
    filter: "grayscale(0.3)",
  },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#3366cc",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  },
  danger: {
    border: "none",
    background: "transparent",
    color: "#c44",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  },
  status: {
    margin: "0 0 8px",
    fontSize: 12,
    color: "#444",
    background: "#fff8e6",
    padding: "6px 8px",
    borderRadius: 6,
  },
  list: { listStyle: "none", margin: 0, padding: 0 },
  item: {
    borderTop: "1px solid #f0f0ec",
    padding: "8px 0",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  jobHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    width: "100%",
    border: "none",
    background: "transparent",
    padding: 0,
    cursor: "pointer",
    textAlign: "left",
  },
  jobHeadText: {
    color: "#1a1a1a",
    fontSize: 12,
    fontWeight: 600,
    flex: 1,
  },
  meta: { fontSize: 11, color: "#888" },
  detail: {
    background: "#fafaf8",
    border: "1px solid #eee",
    borderRadius: 6,
    padding: 8,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  detailMeta: { fontSize: 11, color: "#666", lineHeight: 1.4 },
  roleBlock: {
    borderTop: "1px solid #eee",
    paddingTop: 6,
  },
  rawBox: {
    margin: 0,
    maxHeight: 180,
    overflow: "auto",
    fontSize: 10,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#fff",
    border: "1px solid #eee",
    borderRadius: 4,
    padding: 6,
  },
};
