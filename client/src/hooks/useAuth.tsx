import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { User } from "../lib/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  providers: string[];
  logout: () => Promise<void>;
  updateProfile: (data: { name?: string; themePrefs?: Record<string, string> }) => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  providers: [],
  logout: async () => {},
  updateProfile: async () => {},
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

  const updateProfile = async (data: { name?: string; themePrefs?: Record<string, string> }) => {
    const updatedUser = await api.patch<User>("/auth/me", data);
    setUser(updatedUser);
  };

  useEffect(() => {
    if (user?.themePrefs) {
      const root = document.documentElement;
      // We assume themePrefs keys match CSS variable suffixes like 'paper', 'ink', 'pen-blue'
      for (const [key, value] of Object.entries(user.themePrefs)) {
        if (value) {
          root.style.setProperty(`--color-${key}`, value);
        } else {
          root.style.removeProperty(`--color-${key}`);
        }
      }
    }
  }, [user?.themePrefs]);

  return (
    <AuthContext.Provider value={{ user, loading, providers, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
