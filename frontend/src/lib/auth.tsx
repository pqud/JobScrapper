import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  loginDev: (email?: string) => void;
  logout: () => void;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DEV_KEY = "jobscrap_dev_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const devAuth = import.meta.env.VITE_DEV_AUTH !== "false";

  useEffect(() => {
    if (devAuth) {
      const raw = localStorage.getItem(DEV_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthUser;
        setUser(parsed);
        setToken(`demo:${parsed.uid}`);
      }
      setLoading(false);
      return;
    }

    // Firebase Auth path (optional when env configured)
    void (async () => {
      try {
        const { initializeApp } = await import("firebase/app");
        const { getAuth, onAuthStateChanged } = await import("firebase/auth");
        const app = initializeApp({
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        });
        const auth = getAuth(app);
        return onAuthStateChanged(auth, async (fbUser) => {
          if (!fbUser) {
            setUser(null);
            setToken(null);
          } else {
            setUser({
              uid: fbUser.uid,
              email: fbUser.email,
              displayName: fbUser.displayName,
            });
            setToken(await fbUser.getIdToken());
          }
          setLoading(false);
        });
      } catch {
        setLoading(false);
      }
    })();
  }, [devAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      loginDev: (email = "demo@jobscrap.local") => {
        const next: AuthUser = {
          uid: "dev-user",
          email,
          displayName: "Demo User",
        };
        localStorage.setItem(DEV_KEY, JSON.stringify(next));
        setUser(next);
        setToken(`demo:${next.uid}`);
      },
      logout: () => {
        localStorage.removeItem(DEV_KEY);
        setUser(null);
        setToken(null);
      },
      getIdToken: async () => token,
    }),
    [user, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
