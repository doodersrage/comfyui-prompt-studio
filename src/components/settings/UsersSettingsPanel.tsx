"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { ToolSection } from "@/components/ui/ToolPageShell";
import { ButtonLink } from "@/components/ui/Button";
import UsersAdminPanel from "@/components/settings/UsersAdminPanel";

export default function UsersSettingsPanel() {
  const { loading, authEnabled, user, isAdmin } = useAuth();

  if (loading) {
    return (
      <ToolSection title="Users">
        <p className="text-sm text-zinc-500">Loading account settings…</p>
      </ToolSection>
    );
  }

  if (!authEnabled) {
    return (
      <ToolSection title="Enable user accounts">
        <p className="text-sm text-zinc-400">
          User accounts are off. Add these to <code className="text-zinc-300">.env.local</code> and
          restart the dev server to unlock login, per-user history, and this admin panel.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 text-xs text-zinc-300">
{`PROMPT_AUTH_ENABLED=true
PROMPT_ADMIN_USERNAME=admin
PROMPT_ADMIN_PASSWORD="change-me"
PROMPT_SESSION_SECRET=use-a-long-random-string
PROMPT_DATA_DIR=/path/to/persist/auth-and-analytics`}
        </pre>
        <p className="mt-4 text-sm text-zinc-500">
          Quote passwords that contain <code className="text-zinc-400">$</code> or{" "}
          <code className="text-zinc-400">#</code>. After changing admin credentials in{" "}
          <code className="text-zinc-400">.env.local</code>, restart the server — the bootstrap
          admin account syncs from env on startup.
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          After restart, sign in at{" "}
          <Link href="/login" className="text-violet-300 hover:text-violet-200">
            /login
          </Link>{" "}
          with the admin credentials above, then return here.
        </p>
      </ToolSection>
    );
  }

  if (!user) {
    return (
      <ToolSection title="Sign in required">
        <p className="text-sm text-zinc-400">
          User accounts are enabled. Sign in as an admin to manage users, groups, and analytics
          snapshots.
        </p>
        <ButtonLink href="/login" variant="primary" className="mt-4 inline-flex">
          Sign in
        </ButtonLink>
      </ToolSection>
    );
  }

  if (!isAdmin) {
    return (
      <ToolSection title="Admin only">
        <p className="text-sm text-zinc-400">
          Signed in as <span className="text-zinc-200">{user.username}</span>. Only admin accounts
          can manage users and groups. Ask an admin to promote your account or adjust blocked
          features.
        </p>
      </ToolSection>
    );
  }

  return <UsersAdminPanel />;
}
