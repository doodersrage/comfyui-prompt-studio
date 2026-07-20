"use client";

import { useEffect } from "react";
import { reloadGalleryForActiveUser } from "@/lib/gallery-db-store";
import { setActiveUserScope, USER_SCOPE_CHANGED_EVENT } from "@/lib/user-scope";
import { scheduleUserAnalyticsSync } from "@/lib/user-analytics-sync";

type SessionPayload = {
  authEnabled?: boolean;
  user?: { id: string; username: string; role: string } | null;
};

async function syncScopeFromSession(): Promise<void> {
  try {
    const response = await fetch("/api/auth/session", { cache: "no-store" });
    const data = (await response.json()) as SessionPayload;
    if (data.authEnabled && data.user) {
      setActiveUserScope({ id: data.user.id, username: data.user.username });
    } else {
      setActiveUserScope(null);
    }
    await reloadGalleryForActiveUser();
    scheduleUserAnalyticsSync();
  } catch {
    setActiveUserScope(null);
  }
}

export default function UserScopeInit() {
  useEffect(() => {
    void syncScopeFromSession();

    const onScopeSync = () => {
      void reloadGalleryForActiveUser();
    };
    window.addEventListener(USER_SCOPE_CHANGED_EVENT, onScopeSync);
    return () => window.removeEventListener(USER_SCOPE_CHANGED_EVENT, onScopeSync);
  }, []);

  return null;
}
