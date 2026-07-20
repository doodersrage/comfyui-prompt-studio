"use client";

import { useCallback, useEffect, useState } from "react";
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

export function useAuth() {
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

  return {
    ...state,
    refresh,
    logout,
    isAdmin: state.user?.role === "admin",
  };
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
