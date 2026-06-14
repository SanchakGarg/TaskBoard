import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../lib/api";
import type { User } from "../lib/types";
import { showToast } from "../components/ui/Toast";

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
    const handleUnauthorized = () => setUser(null);
    window.addEventListener("api-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("api-unauthorized", handleUnauthorized);
  }, []);

  useEffect(() => {
    const isPublic = window.location.hash.startsWith("#/public/");

    Promise.all([
      isPublic
        ? Promise.resolve(null)
        : api.get<User>("/auth/me").catch((e: unknown) => {
            if (e instanceof ApiError && e.status === 401) return null;
            throw e;
          }),
      api.get<{ providers: string[] }>("/auth/providers").catch((e) => {
        console.error("Failed to fetch providers:", e);
        return { providers: [] };
      }),
    ])
      .then(([me, p]) => {
        setUser(me);
        setProviders(p.providers);
      })
      .catch((e) => {
        console.error("Auth initialization failed:", e);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    try {
      await api.post("/auth/logout");
      setUser(null);
    } catch (e) {
      showToast("Something went wrong while logging out.", "error");
    }
  };

  const updateProfile = async (data: { name?: string; themePrefs?: Record<string, string> }) => {
    try {
      const updatedUser = await api.patch<User>("/auth/me", data);
      setUser(updatedUser);
    } catch (e) {
      showToast("Something went wrong. Please try again later.", "error");
    }
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
