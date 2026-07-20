"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AppFeatureId } from "@/lib/auth/features";
import type { AuthSessionResponse, AuthUserPublic } from "@/lib/auth/types";
import { setActiveUserScope } from "@/lib/user-scope";

type AuthState = {
  loading: boolean;
  authEnabled: boolean;
  user: AuthUserPublic | null;
  allowedFeatures: AppFeatureId[] | "all";
};

const INITIAL: AuthState = {
  loading: true,
  authEnabled: false,
  user: null,
  allowedFeatures: "all",
};

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(INITIAL);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      const data = (await response.json()) as AuthSessionResponse & {
        defaultAdminUsername?: string;
      };
      setState({
        loading: false,
        authEnabled: Boolean(data.authEnabled),
        user: data.user,
        allowedFeatures:
          data.allowedFeatures === "all"
            ? "all"
            : Array.isArray(data.allowedFeatures)
              ? data.allowedFeatures
              : [],
      });
      if (data.authEnabled && data.user) {
        setActiveUserScope({ id: data.user.id, username: data.user.username });
      } else {
        setActiveUserScope(null);
      }
    } catch {
      setState({ ...INITIAL, loading: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      logout,
      isAdmin: state.user?.role === "admin",
    }),
    [state, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

export function canAccessNavFeature(
  allowed: AppFeatureId[] | "all",
  feature: AppFeatureId | null,
): boolean {
  if (!feature) {
    return true;
  }
  if (allowed === "all") {
    return true;
  }
  return allowed.includes(feature);
}
