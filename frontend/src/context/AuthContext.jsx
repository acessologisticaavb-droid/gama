import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api, apiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null = loading, false = anon, obj = authed
  const [booting, setBooting] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    } catch {
      setUser(false);
      return false;
    } finally {
      setBooting(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (username, password) => {
    try {
      const { data } = await api.post("/auth/login", { username, password });
      setUser(data);
      return { ok: true, user: data };
    } catch (e) {
      return { ok: false, error: apiError(e.response?.data?.detail) };
    }
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      /* ignore */
    }
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, booting, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
