"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { featureForPath } from "@/lib/auth/features";
import { canAccessNavFeature, useAuth } from "@/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";
import { loadToolPlugins, BUILTIN_TOOL_PLUGINS, type ToolPlugin } from "@/lib/tool-plugin-registry";

type NavLink = {
  href: string;
  label: string;
  description: string;
};

type NavGroup = {
  label: string;
  links: NavLink[];
};

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    links: [
      { href: "/dashboard", label: "Dashboard", description: "Jobs, queue & recent outputs" },
      { href: "/queue", label: "Queue", description: "Central ComfyUI job queue" },
    ],
  },
  {
    label: "Prompt",
    links: [
      { href: "/", label: "Generate", description: "Keywords or random scene" },
      { href: "/format", label: "Format", description: "Draft → model-ready" },
      { href: "/lint", label: "Lint", description: "Diagnostics & fix" },
      { href: "/topics", label: "Topics", description: "Idea list" },
    ],
  },
  {
    label: "Scene",
    links: [
      {
        href: "/character",
        label: "Character",
        description: "Solo, duo, or with background",
      },
      { href: "/background", label: "Background", description: "No people" },
      { href: "/pet", label: "Pet", description: "Dogs, cats & more" },
      { href: "/fantasy", label: "Fantasy", description: "Magic & myth" },
    ],
  },
  {
    label: "Tools",
    links: [
      { href: "/image-prompt", label: "Image → Prompt", description: "Vision upload" },
      { href: "/refine", label: "Refine", description: "Image + intent fix" },
      { href: "/controlnet", label: "ControlNet", description: "Structure prompts" },
      { href: "/video", label: "Video", description: "Motion prompts" },
      { href: "/negative", label: "Negative", description: "SD negatives" },
      { href: "/studio", label: "Studio", description: "History & tools" },
      { href: "/gallery", label: "Gallery", description: "ComfyUI outputs" },
      { href: "/variations", label: "Variations", description: "Grid queue" },
      { href: "/variations?matrix=1", label: "Matrix", description: "Cartesian prompts" },
      { href: "/plugins", label: "Plugins", description: "Tool registry" },
    ],
  },
];

const settingsLink: NavLink = {
  href: "/settings",
  label: "Settings",
  description: "Health & ComfyUI",
};

function SidebarLink({ link, active }: { link: NavLink; active: boolean }) {
  return (
    <Link
      href={link.href}
      title={link.description}
      data-active={active ? "true" : "false"}
      className="ui-nav-link"
    >
      {link.label}
    </Link>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { authEnabled, user, allowedFeatures, logout, impersonating, impersonatorUsername, refresh } =
    useAuth();
  const [customPlugins, setCustomPlugins] = useState<ToolPlugin[]>([]);

  useEffect(() => {
    const builtinIds = new Set(BUILTIN_TOOL_PLUGINS.map((entry) => entry.id));
    const knownHrefs = new Set(
      navGroups.flatMap((group) =>
        group.links.map((link) => link.href.split("?")[0] ?? link.href),
      ),
    );
    setCustomPlugins(
      loadToolPlugins().filter(
        (entry) =>
          !builtinIds.has(entry.id) &&
          !knownHrefs.has(entry.href.split("?")[0] ?? entry.href),
      ),
    );
  }, []);

  const visibleGroups = useMemo(() => {
    const pluginLinks: NavLink[] = customPlugins.map((plugin) => ({
      href: plugin.href,
      label: plugin.label,
      description: plugin.description,
    }));

    return navGroups
      .map((group) => ({
        ...group,
        links:
          group.label === "Tools"
            ? [...group.links, ...pluginLinks]
            : group.links,
      }))
      .map((group) => ({
        ...group,
        links: group.links.filter((link) =>
          canAccessNavFeature(
            allowedFeatures,
            featureForPath(link.href.split("?")[0] ?? link.href),
          ),
        ),
      }))
      .filter((group) => group.links.length > 0);
  }, [allowedFeatures, customPlugins]);

  const settingsVisible = canAccessNavFeature(allowedFeatures, "settings");
  const profileVisible = authEnabled && Boolean(user);

  async function endImpersonation() {
    await fetch("/api/auth/impersonate", { method: "DELETE" });
    await refresh();
    window.location.href = "/settings?tab=users";
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {impersonating ? (
        <div className="mx-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
          Viewing as <span className="font-medium">{user?.username}</span>
          {impersonatorUsername ? ` (admin: ${impersonatorUsername})` : ""}.
          <button
            type="button"
            onClick={() => void endImpersonation()}
            className="mt-2 block text-amber-200 underline underline-offset-2"
          >
            Exit impersonation
          </button>
        </div>
      ) : null}
      <div className="px-2">
        <Link
          href="/"
          onClick={onNavigate}
          className="ui-nav-brand type-title"
        >
          Prompt Tools
        </Link>
        <p className="type-caption mt-1 px-3">
          ComfyUI prompt studio for image models
        </p>
      </div>

      <div className="sidebar-scroll flex-1 space-y-6 overflow-y-auto px-2 pb-2">
        {visibleGroups.map((group) => (
          <div key={group.label} className="space-y-2">
            <p className="type-overline px-3">{group.label}</p>
            <div className="space-y-1">
              {group.links.map((link) => (
                <div key={link.href} onClick={onNavigate}>
                  <SidebarLink link={link} active={pathname === link.href} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border-subtle)] px-2 pt-4 space-y-3">
        <div className="flex justify-end px-1">
          <NotificationBell />
        </div>
        {authEnabled && user ? (
          <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/40 px-3 py-3">
            <p className="text-sm font-medium text-zinc-100">{user.username}</p>
            <p className="type-caption mt-0.5 capitalize">{user.role}</p>
            {profileVisible ? (
              <Link
                href="/profile"
                onClick={onNavigate}
                className="mt-2 block text-xs text-violet-300 hover:text-violet-200"
              >
                Profile & preferences
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => void logout()}
              className="mt-2 block text-xs text-zinc-400 transition hover:text-zinc-200"
            >
              Sign out
            </button>
          </div>
        ) : null}
        {settingsVisible ? (
          <div onClick={onNavigate}>
            <SidebarLink
              link={settingsLink}
              active={pathname === settingsLink.href}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--border-subtle)] bg-[var(--bg-muted)] px-4 py-3 backdrop-blur-md lg:hidden">
        <Link href="/" className="type-heading">
          Prompt Tools
        </Link>
        <button
          type="button"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileOpen((open) => !open)}
          className="ui-btn-secondary px-3 py-2"
        >
          {mobileOpen ? "Close" : "Menu"}
        </button>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          className="ui-overlay fixed inset-0 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[var(--sidebar-width)] border-r border-[var(--border-subtle)] bg-[var(--bg-muted)] py-5 backdrop-blur-md transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </aside>
    </>
  );
}
