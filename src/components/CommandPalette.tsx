"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { canAccessNavFeature, useAuth } from "@/hooks/useAuth";
import { featureForPath } from "@/lib/auth/features";

type CommandItem = {
  id: string;
  label: string;
  href?: string;
  action?: () => void;
  group: string;
};

const STATIC_ITEMS: CommandItem[] = [
  { id: "home", label: "Generate", href: "/", group: "Navigate" },
  { id: "gallery", label: "Gallery", href: "/gallery", group: "Navigate" },
  { id: "studio", label: "Studio", href: "/studio", group: "Navigate" },
  { id: "settings", label: "Settings", href: "/settings", group: "Navigate" },
  { id: "profile", label: "Profile", href: "/profile", group: "Navigate" },
  { id: "dashboard", label: "Dashboard", href: "/dashboard", group: "Navigate" },
  { id: "variations", label: "Variations", href: "/variations", group: "Navigate" },
  { id: "format", label: "Format", href: "/format", group: "Navigate" },
  { id: "character", label: "Character", href: "/character", group: "Navigate" },
  { id: "image-prompt", label: "Image → Prompt", href: "/image-prompt", group: "Navigate" },
  { id: "queue", label: "Queue", href: "/queue", group: "Navigate" },
  { id: "sync-now", label: "Sync storage now", action: () => void import("@/lib/auto-storage-sync").then((m) => m.autoPushStorageDebounced()), group: "Actions" },
  { id: "review-gallery", label: "Open gallery review", href: "/gallery?review=1", group: "Actions" },
  { id: "reload", label: "Reload page", action: () => window.location.reload(), group: "Actions" },
];

export default function CommandPalette() {
  const router = useRouter();
  const { allowedFeatures } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const items = useMemo(
    () =>
      STATIC_ITEMS.filter((item) => {
        if (!item.href) {
          return true;
        }
        const feature = featureForPath(item.href);
        return canAccessNavFeature(allowedFeatures, feature);
      }),
    [allowedFeatures],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(q) || item.group.toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
        setQuery("");
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-700/80 bg-zinc-950/95 shadow-2xl">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Jump to a page or action…"
          className="w-full border-b border-zinc-800 bg-transparent px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-zinc-500">No matches.</li>
          ) : (
            filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm text-zinc-200 transition hover:bg-violet-500/10"
                  onClick={() => {
                    setOpen(false);
                    if (item.action) {
                      item.action();
                      return;
                    }
                    if (item.href) {
                      router.push(item.href);
                    }
                  }}
                >
                  <span>{item.label}</span>
                  <span className="text-xs text-zinc-500">{item.group}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-500">
          Tip: press <kbd className="rounded border border-zinc-700 px-1">Ctrl+K</kbd> anywhere.{" "}
          <Link href="/settings" className="text-violet-300" onClick={() => setOpen(false)}>
            Settings
          </Link>
        </div>
      </div>
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 -z-10"
        onClick={() => setOpen(false)}
      />
    </div>
  );
}
