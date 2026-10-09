/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, SESSION_EXPIRED_EVENT } from "./api";

const AuthContext = createContext(null);

/*
  Holds the signed-in user. On start it asks the server who is logged in
  (the session cookie is httpOnly, so only the server can tell).
*/
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("checking"); // checking | ready
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api("/auth/session", { signal: controller.signal })
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => {
        if (!controller.signal.aborted) setStatus("ready");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onExpired = (event) => {
      setUser(null);
      setNotice(event.detail || "Your session has ended. Please log in again.");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    setNotice("");
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password) => {
    const data = await api("/auth/register", { method: "POST", body: { name, email, password } });
    setNotice("");
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async ({ everywhere = false } = {}) => {
    try {
      await api(everywhere ? "/auth/logout-all" : "/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  }, []);

  const forget = useCallback(() => setUser(null), []);

  const value = useMemo(
    () => ({ user, status, notice, setNotice, login, register, logout, forget }),
    [user, status, notice, login, register, logout, forget]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
