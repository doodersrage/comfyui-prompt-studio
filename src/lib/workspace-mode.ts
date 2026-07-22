import { readBrowserString, writeBrowserString } from "./browser-storage";
import {
  APP_NAV_GROUPS,
  APP_NAV_SETTINGS_LINK,
  flattenAppNavLinks,
  type AppNavGroup,
  type AppNavLink,
} from "./app-nav-catalog";
import { markOnboardingSetWorkspace } from "./onboarding-hooks";

export type WorkspaceMode = "simple" | "studio" | "full";

const MODE_KEY = "comfy-workspace-mode-v1";
const CHOSEN_KEY = "comfy-workspace-mode-chosen-v1";

export const WORKSPACE_MODE_OPTIONS: {
  id: WorkspaceMode;
  label: string;
  description: string;
}[] = [
  {
    id: "simple",
    label: "Simple",
    description: "Essentials in the sidebar; advanced tools under More. Lean shared controls.",
  },
  {
    id: "studio",
    label: "Studio",
    description: "Full catalog in Edit / Media / Library groups. Collapsed advanced controls.",
  },
  {
    id: "full",
    label: "Full",
    description: "Everything visible — power-user layout with advanced controls ready.",
  },
];

/** Primary destinations for Simple workspace (path or path?query). */
export const SIMPLE_NAV_HREFS = [
  "/",
  "/character",
  "/refine",
  "/compose",
  "/inpaint",
  "/gallery",
  "/queue",
  "/studio",
] as const;

export function normalizeWorkspaceMode(value: unknown): WorkspaceMode {
  if (value === "simple" || value === "studio" || value === "full") {
    return value;
  }
  return "studio";
}

export function loadWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") {
    return "studio";
  }
  return normalizeWorkspaceMode(readBrowserString(MODE_KEY));
}

export function saveWorkspaceMode(mode: WorkspaceMode): void {
  if (typeof window === "undefined") {
    return;
  }
  const next = normalizeWorkspaceMode(mode);
  writeBrowserString(MODE_KEY, next);
  writeBrowserString(CHOSEN_KEY, "1");
  document.documentElement.dataset.workspace = next;
  markOnboardingSetWorkspace();
}

export function hasChosenWorkspaceMode(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  return readBrowserString(CHOSEN_KEY) === "1";
}

/** Returning users already have chrome prefs — don't force the welcome dialog. */
function hasExistingChromePrefs(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return Boolean(
    readBrowserString("comfy-nav-favorites-v1") ||
      readBrowserString("comfy-ui-density-v1") ||
      readBrowserString("comfy-nav-expanded-groups-v1") ||
      readBrowserString("comfy-recent-destinations-v1"),
  );
}

export function applyWorkspaceMode(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!hasChosenWorkspaceMode() && hasExistingChromePrefs()) {
    writeBrowserString(CHOSEN_KEY, "1");
  }
  document.documentElement.dataset.workspace = loadWorkspaceMode();
}

export function clearWorkspaceModeChoice(): void {
  if (typeof window === "undefined") {
    return;
  }
  writeBrowserString(CHOSEN_KEY, "");
}

function hrefKey(href: string): string {
  return href.split("?")[0] || "/";
}

function linkByHref(href: string, catalog: AppNavLink[]): AppNavLink | undefined {
  return (
    catalog.find((link) => link.href === href) ??
    catalog.find((link) => hrefKey(link.href) === hrefKey(href))
  );
}

/**
 * Studio/Full IA: split the old mega-Tools list into Edit / Media / Library.
 * Simple: Essentials + More tools.
 */
export function navGroupsForWorkspaceMode(
  mode: WorkspaceMode,
  baseGroups: AppNavGroup[] = APP_NAV_GROUPS,
): AppNavGroup[] {
  const flat = flattenAppNavLinks(baseGroups);
  const byHref = (href: string) => linkByHref(href, flat);

  if (mode === "simple") {
    const essentials = SIMPLE_NAV_HREFS.map((href) => byHref(href)).filter(
      (link): link is AppNavLink => Boolean(link),
    );
    const essentialKeys = new Set(essentials.map((link) => link.href));
    const more = flat.filter((link) => !essentialKeys.has(link.href));
    const groups: AppNavGroup[] = [{ label: "Essentials", links: essentials }];
    if (more.length > 0) {
      groups.push({ label: "More tools", links: more });
    }
    return groups;
  }

  // Studio + Full share the same group structure (baseGroups already restructured).
  return baseGroups;
}

/** Default expanded group labels for a workspace mode when the user has no saved prefs. */
export function defaultExpandedNavGroups(
  mode: WorkspaceMode,
  groups: AppNavGroup[],
): string[] {
  if (mode === "simple") {
    return ["Essentials"];
  }
  if (mode === "full") {
    return groups.map((group) => group.label);
  }
  // Studio: keep Media collapsed by default to reduce noise.
  return groups
    .map((group) => group.label)
    .filter((label) => label !== "Media");
}

export function workspaceShowsAdvancedControls(mode: WorkspaceMode): boolean {
  return mode !== "simple";
}

export function workspaceControlsDefaultOpen(mode: WorkspaceMode): boolean {
  return mode === "full";
}

export { APP_NAV_SETTINGS_LINK };
