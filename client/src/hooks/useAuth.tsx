import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  providers: string[];
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  providers: [],
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [providers, setProviders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<User>("/auth/me").catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }),
      api.get<{ providers: string[] }>("/auth/providers"),
    ])
      .then(([me, p]) => {
        setUser(me);
        setProviders(p.providers);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, providers, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
