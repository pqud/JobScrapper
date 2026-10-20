import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, logout, loginDev } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-black/5 bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-display text-xl font-bold tracking-tight text-mossDark">
            JobScrap Sync
          </Link>
          <nav className="flex items-center gap-5 text-sm font-medium">
            <NavLink
              to="/scraps"
              className={({ isActive }) =>
                isActive ? "text-moss" : "text-ink/70 hover:text-ink"
              }
            >
              스크랩
            </NavLink>
            <NavLink
              to="/scraps/insights"
              className={({ isActive }) =>
                isActive ? "text-moss" : "text-ink/70 hover:text-ink"
              }
            >
              인사이트
            </NavLink>
            <NavLink
              to="/connect"
              className={({ isActive }) =>
                isActive ? "text-moss" : "text-ink/70 hover:text-ink"
              }
            >
              확장 연결
            </NavLink>
            {user ? (
              <button
                onClick={logout}
                className="rounded-lg border border-black/10 px-3 py-1.5 text-ink/80 hover:bg-white"
              >
                로그아웃
              </button>
            ) : (
              <button
                onClick={() => loginDev()}
                className="rounded-lg bg-moss px-3 py-1.5 text-white hover:bg-mossDark"
              >
                데모 로그인
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
