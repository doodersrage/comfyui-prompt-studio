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
    label: "Tools",
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
