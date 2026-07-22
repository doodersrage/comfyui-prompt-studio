/** Shared nav catalog for AppNav + Command Palette. */

export type AppNavLink = {
  href: string;
  label: string;
  description: string;
};

export type AppNavGroup = {
  label: string;
  links: AppNavLink[];
};

export const APP_NAV_GROUPS: AppNavGroup[] = [
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
      { href: "/prompt", label: "Prompt Editor", description: "Edit & optimize" },
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
    label: "Edit",
    links: [
      { href: "/image-prompt", label: "Image → Prompt", description: "Vision upload" },
      { href: "/refine", label: "Refine", description: "Image + intent fix" },
      { href: "/inpaint", label: "Inpaint", description: "Mask + region prompt" },
      {
        href: "/outpaint",
        label: "Outpaint",
        description: "Expand canvas borders",
      },
      {
        href: "/compose",
        label: "Compose",
        description: "Multi-image transfer & edit",
      },
      {
        href: "/workflow-editor",
        label: "Workflow editor",
        description: "Edit Comfy node graphs",
      },
      { href: "/controlnet", label: "ControlNet", description: "Structure prompts" },
      { href: "/negative", label: "Negative", description: "SD negatives" },
    ],
  },
  {
    label: "Media",
    links: [
      { href: "/video", label: "Video", description: "Motion prompts" },
      { href: "/audio", label: "Audio", description: "Sound / music prompts" },
      { href: "/mesh", label: "3D Mesh", description: "Image → mesh prompts" },
    ],
  },
  {
    label: "Library",
    links: [
      { href: "/studio", label: "Studio", description: "History & tools" },
      { href: "/gallery", label: "Gallery", description: "ComfyUI outputs" },
      { href: "/variations", label: "Variations", description: "Grid queue" },
      { href: "/variations?matrix=1", label: "Matrix", description: "Cartesian prompts" },
      { href: "/plugins", label: "Plugins", description: "Tool registry" },
    ],
  },
];

export const APP_NAV_SETTINGS_LINK: AppNavLink = {
  href: "/settings",
  label: "Settings",
  description: "Health & ComfyUI",
};

export const APP_NAV_PROFILE_LINK: AppNavLink = {
  href: "/profile",
  label: "Profile",
  description: "Appearance & account",
};

export function flattenAppNavLinks(groups: AppNavGroup[] = APP_NAV_GROUPS): AppNavLink[] {
  return groups.flatMap((group) => group.links);
}

/**
 * Append plugin-contributed links into the Library group, skipping hrefs already
 * present in the catalog (path match, query ignored).
 */
export function mergePluginLinksIntoNav(
  groups: AppNavGroup[] = APP_NAV_GROUPS,
  pluginLinks: AppNavLink[],
): AppNavGroup[] {
  if (!pluginLinks.length) {
    return groups;
  }
  const existing = new Set(
    groups.flatMap((group) =>
      group.links.map((link) => link.href.split("?")[0] ?? link.href),
    ),
  );
  const unique = pluginLinks.filter((link) => {
    const path = link.href.split("?")[0] ?? link.href;
    if (existing.has(path)) {
      return false;
    }
    existing.add(path);
    return true;
  });
  if (!unique.length) {
    return groups;
  }
  let merged = false;
  const next = groups.map((group) => {
    if (group.label !== "Library" && group.label !== "Tools") {
      return group;
    }
    merged = true;
    return { ...group, links: [...group.links, ...unique] };
  });
  if (merged) {
    return next;
  }
  return [...next, { label: "Plugins", links: unique }];
}
