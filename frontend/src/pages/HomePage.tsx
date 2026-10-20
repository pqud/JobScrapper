import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function HomePage() {
  const { user, loginDev } = useAuth();

  return (
    <section className="relative overflow-hidden rounded-3xl px-6 py-16 sm:px-12 sm:py-20">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          backgroundImage:
            "linear-gradient(135deg, #0f766e 0%, #134e4a 42%, #1c1917 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 80% 20%, #5eead4 0%, transparent 40%)",
        }}
      />

      <p className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl">
        JobScrap Sync
      </p>
      <h1 className="mt-4 max-w-xl text-lg text-teal-50/90 sm:text-xl">
        여러 채용 사이트의 스크랩을 한곳에 모으고, 기술 키워드로 정리합니다.
      </h1>
      <div className="mt-8 flex flex-wrap gap-3">
        {user ? (
          <Link
            to="/scraps"
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-mossDark shadow-lg shadow-black/20 transition hover:translate-y-[-1px]"
          >
            내 스크랩 보기
          </Link>
        ) : (
          <button
            onClick={() => loginDev()}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-mossDark shadow-lg shadow-black/20 transition hover:translate-y-[-1px]"
          >
            데모로 시작하기
          </button>
        )}
        <Link
          to="/connect"
          className="rounded-xl border border-white/30 px-5 py-2.5 text-sm font-semibold text-white/95 backdrop-blur hover:bg-white/10"
        >
          확장 연결
        </Link>
      </div>
    </section>
  );
}
