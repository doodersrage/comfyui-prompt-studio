"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { useAuth } from "@/hooks/useAuth";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function completeLogin(data: { user?: unknown; allowedFeatures?: unknown }) {
    if (!data.user) {
      throw new Error("Sign in failed.");
    }
    const next = searchParams.get("next") || "/";
    await refresh();
    router.replace(next);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(
          pendingToken
            ? { pendingToken, totpCode }
            : { username, password },
        ),
      });
      const data = (await response.json()) as {
        error?: string;
        requiresTotp?: boolean;
        pendingToken?: string;
        user?: unknown;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Sign in failed.");
      }

      if (data.requiresTotp && data.pendingToken) {
        setPendingToken(data.pendingToken);
        return;
      }

      await completeLogin(data);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mx-auto w-full max-w-md space-y-5 rounded-3xl border border-zinc-800/80 bg-zinc-950/70 p-8 shadow-[0_24px_80px_-40px_rgba(124,58,237,0.45)] backdrop-blur-md"
    >
      <div className="space-y-2">
        <h1 className="type-title text-zinc-50">{pendingToken ? "Authenticator code" : "Sign in"}</h1>
        <p className="text-sm text-zinc-400">
          {pendingToken
            ? "Enter the 6-digit code from your authenticator app."
            : "Use your Prompt Studio account. Default admin is created on first enable."}
        </p>
      </div>

      {!pendingToken ? (
        <>
          <label className="block space-y-2">
            <span className="type-caption text-zinc-400">Username</span>
            <TextInput value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>

          <label className="block space-y-2">
            <span className="type-caption text-zinc-400">Password</span>
            <TextInput
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
        </>
      ) : (
        <label className="block space-y-2">
          <span className="type-caption text-zinc-400">Authenticator code</span>
          <TextInput
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        </label>
      )}

      {error ? (
        <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Signing in…" : pendingToken ? "Verify code" : "Sign in"}
      </Button>
    </form>
  );
}
