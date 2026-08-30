import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { UNAUTHORIZED_EVENT, me as fetchMe, type Me } from "./api";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authed"; me: Me };

type AuthContextValue = {
  state: AuthState;
  refresh: () => Promise<void>;
  clear: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    const r = await fetchMe();
    if (r.isOk()) setState({ status: "authed", me: r.value });
    else setState({ status: "anonymous" });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // どこかの API が 401 を返したら、その場でログイン画面へ
  useEffect(() => {
    const onUnauthorized = () => setState({ status: "anonymous" });
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, refresh, clear: () => setState({ status: "anonymous" }) }),
    [state, refresh],
  );
  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error("AuthProvider が無い");
  return v;
}
