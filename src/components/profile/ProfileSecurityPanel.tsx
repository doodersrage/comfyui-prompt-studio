"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { ToolSection } from "@/components/ui/ToolPageShell";
import {
  DEFAULT_KEYBOARD_SHORTCUTS,
  loadKeyboardShortcuts,
  saveKeyboardShortcuts,
} from "@/lib/keyboard-shortcuts-store";

type ApiKeyRow = {
  id: string;
  label: string;
  prefix: string;
  createdAt: number;
  lastUsedAt?: number;
};

type SessionRow = {
  id: string;
  createdAt: number;
  lastSeenAt: number;
  userAgent?: string;
  ip?: string;
};

export default function ProfileSecurityPanel() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [shortcutsJson, setShortcutsJson] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [keysRes, sessionsRes, totpRes] = await Promise.all([
      fetch("/api/auth/api-keys"),
      fetch("/api/auth/sessions"),
      fetch("/api/auth/totp"),
    ]);
    const keysData = (await keysRes.json()) as { keys?: ApiKeyRow[] };
    const sessionsData = (await sessionsRes.json()) as {
      sessions?: SessionRow[];
      currentSessionId?: string;
    };
    const totpData = (await totpRes.json()) as { enabled?: boolean };
    setApiKeys(keysData.keys ?? []);
    setSessions(sessionsData.sessions ?? []);
    setCurrentSessionId(sessionsData.currentSessionId ?? null);
    setTotpEnabled(Boolean(totpData.enabled));
    setShortcutsJson(JSON.stringify(loadKeyboardShortcuts(), null, 2));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="space-y-8">
      {status ? <p className="text-sm text-emerald-400">{status}</p> : null}

      <ToolSection title="API keys">
        <p className="mb-3 text-sm text-zinc-400">
          Personal tokens for CLI and inbound hooks. Use{" "}
          <code className="text-zinc-300">Authorization: Bearer pt_…</code>
        </p>
        <div className="flex flex-wrap gap-2">
          <TextInput
            value={newKeyLabel}
            onChange={(event) => setNewKeyLabel(event.target.value)}
            placeholder="Key label"
          />
          <Button
            variant="secondary"
            onClick={() =>
              void fetch("/api/auth/api-keys", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: newKeyLabel || "API key" }),
              })
                .then((response) => response.json())
                .then((data: { token?: string }) => {
                  setCreatedToken(data.token ?? null);
                  void refresh();
                })
            }
          >
            Create key
          </Button>
        </div>
        {createdToken ? (
          <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
            Copy now — shown once: <code>{createdToken}</code>
          </p>
        ) : null}
        <ul className="mt-3 space-y-2">
          {apiKeys.map((key) => (
            <li key={key.id} className="flex items-center justify-between rounded-xl border border-zinc-800 px-3 py-2 text-sm">
              <span>{key.label} · {key.prefix}…</span>
              <button
                type="button"
                className="text-xs text-rose-300"
                onClick={() =>
                  void fetch("/api/auth/api-keys", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ keyId: key.id }),
                  }).then(() => refresh())
                }
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Active sessions">
        <ul className="space-y-2">
          {sessions.map((session) => (
            <li key={session.id} className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
              <p>{session.userAgent ?? "Unknown device"}</p>
              <p className="text-xs text-zinc-500">
                {session.ip ?? "unknown IP"} · last seen {new Date(session.lastSeenAt).toLocaleString()}
                {session.id === currentSessionId ? " · current" : ""}
              </p>
              {session.id !== currentSessionId ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-rose-300"
                  onClick={() =>
                    void fetch("/api/auth/sessions", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sessionId: session.id }),
                    }).then(() => refresh())
                  }
                >
                  Revoke
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </ToolSection>

      <ToolSection title="Two-factor authentication">
        <p className="mb-3 text-sm text-zinc-400">
          TOTP status: {totpEnabled ? "enabled" : "disabled"}
        </p>
        {!totpEnabled ? (
          <div className="space-y-2">
            <Button
              variant="secondary"
              onClick={() =>
                void fetch("/api/auth/totp", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "begin-setup" }),
                })
                  .then((response) => response.json())
                  .then((data: { secret?: string; uri?: string }) =>
                    setTotpSetup(
                      data.secret && data.uri ? { secret: data.secret, uri: data.uri } : null,
                    ),
                  )
              }
            >
              Begin setup
            </Button>
            {totpSetup ? (
              <div className="space-y-2 text-sm text-zinc-400">
                <p>Secret: <code>{totpSetup.secret}</code></p>
                <TextInput value={totpCode} onChange={(event) => setTotpCode(event.target.value)} placeholder="6-digit code" />
                <Button
                  onClick={() =>
                    void fetch("/api/auth/totp", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "confirm", code: totpCode }),
                    }).then(() => {
                      setTotpSetup(null);
                      setTotpCode("");
                      void refresh();
                      setStatus("TOTP enabled.");
                    })
                  }
                >
                  Confirm TOTP
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <Button
            variant="ghost"
            onClick={() =>
              void fetch("/api/auth/totp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "disable" }),
              }).then(() => refresh())
            }
          >
            Disable TOTP
          </Button>
        )}
      </ToolSection>

      <ToolSection title="Keyboard shortcuts">
        <textarea
          value={shortcutsJson}
          onChange={(event) => setShortcutsJson(event.target.value)}
          className="ui-input min-h-32 w-full font-mono text-xs"
        />
        <Button
          className="mt-2"
          variant="secondary"
          onClick={() => {
            try {
              saveKeyboardShortcuts(JSON.parse(shortcutsJson));
              setStatus("Shortcuts saved.");
            } catch {
              setStatus("Invalid shortcuts JSON.");
            }
          }}
        >
          Save shortcuts
        </Button>
        <Button
          className="mt-2 ml-2"
          variant="ghost"
          onClick={() => setShortcutsJson(JSON.stringify(DEFAULT_KEYBOARD_SHORTCUTS, null, 2))}
        >
          Reset defaults
        </Button>
      </ToolSection>
    </div>
  );
}
