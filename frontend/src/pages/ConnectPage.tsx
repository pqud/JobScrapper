import { useEffect, useState } from "react";
import { useAuth } from "../lib/auth";
import { markExtensionConnected } from "../lib/api";
import { pingExtension, sendAuthTokenToExtension } from "../lib/extension";

export function ConnectPage() {
  const { user, token, loginDev } = useAuth();
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void pingExtension().then(setInstalled);
  }, []);

  const handleConnect = async () => {
    if (!token || !user) return;
    setBusy(true);
    try {
      sendAuthTokenToExtension(token);
      await markExtensionConnected(token, user.email, user.displayName);
      setConnected(true);
    } finally {
      setBusy(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg">
        <h1 className="font-display text-3xl font-bold">확장 연결</h1>
        <p className="mt-2 text-ink/65">먼저 로그인해 주세요.</p>
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
    <div className="max-w-lg">
      <h1 className="font-display text-3xl font-bold">확장 연결</h1>
      <p className="mt-2 text-ink/65">
        브라우저 확장을 설치한 뒤 계정을 연결하면, 채용 사이트 스크랩 페이지를
        열 때 자동으로 동기화됩니다.
      </p>

      <ol className="mt-8 space-y-4">
        <li className="rounded-2xl border border-black/5 bg-white/80 p-4">
          <p className="text-sm font-semibold">1. 확장 설치</p>
          {installed === null && (
            <p className="mt-1 text-sm text-ink/55">확인 중…</p>
          )}
          {installed === false && (
            <p className="mt-1 text-sm text-ink/65">
              확장이 감지되지 않았습니다. Chrome에서{" "}
              <code className="rounded bg-mist px-1">extension/dist</code>를
              개발자 모드로 로드해 주세요.
            </p>
          )}
          {installed === true && (
            <p className="mt-1 text-sm text-moss">✓ 확장이 설치되어 있어요</p>
          )}
        </li>

        <li className="rounded-2xl border border-black/5 bg-white/80 p-4">
          <p className="text-sm font-semibold">2. 계정 연결</p>
          {connected ? (
            <p className="mt-1 text-sm text-moss">✓ 연결 완료</p>
          ) : (
            <button
              disabled={!installed || busy}
              onClick={() => void handleConnect()}
              className="mt-3 rounded-xl bg-moss px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? "연결 중…" : "연결하기"}
            </button>
          )}
        </li>

        <li className="rounded-2xl border border-black/5 bg-white/80 p-4">
          <p className="text-sm font-semibold">3. 스크랩 페이지 열기</p>
          <p className="mt-1 text-sm text-ink/65">
            이제 잡코리아 / 원티드 등에서 스크랩 페이지를 한 번 열어주세요.
          </p>
          <ul className="mt-2 space-y-1 text-sm text-mossDark">
            <li>
              <a
                className="underline-offset-2 hover:underline"
                href="https://www.jobkorea.co.kr/User/Scrap"
                target="_blank"
                rel="noreferrer"
              >
                잡코리아 스크랩
              </a>
            </li>
            <li>
              <a
                className="underline-offset-2 hover:underline"
                href="https://www.wanted.co.kr/dashboard/bookmark"
                target="_blank"
                rel="noreferrer"
              >
                원티드 북마크
              </a>
            </li>
          </ul>
        </li>
      </ol>
    </div>
  );
}
