import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  refreshSession,
  setAccessToken,
  setSessionUser,
} from "../services/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const cache = useQueryClient();
  const currentUser = useRef(null);
  const applyUser = useCallback(
    (next) => {
      const previous = currentUser.current;
      currentUser.current = next;
      if (
        previous &&
        (!next || previous.id !== next.id || previous.role !== next.role)
      )
        cache.clear();
      setUser(next);
    },
    [cache],
  );
  useEffect(() => {
    let active = true;
    refreshSession()
      .then((value) => {
        if (active) applyUser(value);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => {
      applyUser(null);
      cache.clear();
    };
    window.addEventListener("session-expired", expired);
    const refreshed = (event) => applyUser(event.detail);
    window.addEventListener("session-refreshed", refreshed);
    return () => {
      active = false;
      window.removeEventListener("session-expired", expired);
      window.removeEventListener("session-refreshed", refreshed);
    };
  }, [cache, applyUser]);
  async function authenticate(mode, values) {
    const { data } = await api.post(`/auth/${mode}`, values);
    cache.clear();
    setAccessToken(data.accessToken, data.user);
    applyUser(data.user);
    return data.user;
  }
  async function logout() {
    await api.post("/auth/logout");
    setAccessToken(undefined);
    applyUser(null);
    cache.clear();
  }
  async function reloadUser() {
    const { data } = await api.get("/auth/me");
    setSessionUser(data.user);
    applyUser(data.user);
    return data.user;
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, authenticate, logout, reloadUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
