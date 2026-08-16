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
    label: 'Overview',
    links: [
      { href: '/dashboard', label: 'Dashboard', description: 'Jobs, queue & recent outputs' },
      { href: '/queue', label: 'Queue', description: 'Central ComfyUI job queue' },
      {
        href: '/m',
        label: 'Mobile Studio',
        description: 'Phone capture, queue, gallery, and play',
      },
    ],
  },
  {
    label: 'Prompt',
    links: [
      { href: '/', label: 'Generate', description: 'Keywords or random scene' },
      { href: '/format', label: 'Format', description: 'Draft → model-ready' },
      { href: '/prompt', label: 'Prompt Editor', description: 'Edit & optimize' },
      { href: '/lint', label: 'Lint', description: 'Diagnostics & fix' },
      { href: '/topics', label: 'Topics', description: 'Idea list' },
    ],
  },
  {
    label: 'Scene',
    links: [
      {
        href: '/characters',
        label: 'Cast',
        description: 'Character home — looks, stills, clips, and LoRA',
      },
      {
        href: '/character',
        label: 'Character',
        description: 'Person, pet, fantasy, or environment — switch on the page',
      },
      {
        href: '/roleplay',
        label: 'Roleplay',
        description: 'Be someone. Pick a scene. Get a still or clip.',
      },
    ],
  },
  {
    label: 'Edit',
    links: [
      { href: '/image-prompt', label: 'Image → Prompt', description: 'Vision upload' },
      { href: '/refine', label: 'Refine', description: 'Image + intent fix' },
      { href: '/inpaint', label: 'Inpaint', description: 'Mask + region prompt' },
      {
        href: '/outpaint',
        label: 'Outpaint',
        description: 'Expand canvas borders',
      },
      {
        href: '/compose',
        label: 'Compose',
        description: 'Multi-image transfer & edit',
      },
      {
        href: '/workflow-editor',
        label: 'Workflow editor',
        description: 'Edit Comfy node graphs',
      },
      { href: '/controlnet', label: 'ControlNet', description: 'Structure prompts' },
      { href: '/negative', label: 'Negative', description: 'SD negatives' },
    ],
  },
  {
    label: 'Media',
    links: [
      { href: '/video', label: 'Video', description: 'Motion prompts' },
      { href: '/audio', label: 'Audio', description: 'Sound / music prompts' },
      { href: '/mesh', label: '3D Mesh', description: 'Image → mesh prompts' },
    ],
  },
  {
    label: 'Library',
    links: [
      { href: '/studio', label: 'Studio', description: 'History & tools' },
      { href: '/gallery', label: 'Gallery', description: 'ComfyUI outputs' },
      { href: '/variations', label: 'Variations', description: 'Grid queue' },
      { href: '/variations?matrix=1', label: 'Matrix', description: 'Cartesian prompts' },
      { href: '/plugins', label: 'Plugins', description: 'Tool registry' },
    ],
  },
];

export const APP_NAV_SETTINGS_LINK: AppNavLink = {
  href: '/settings',
  label: 'Settings',
  description: 'Health & ComfyUI',
};

export const APP_NAV_PROFILE_LINK: AppNavLink = {
  href: '/profile',
  label: 'Profile',
  description: 'Appearance & account',
};

/** Kept for command palette / Simple “More tools”; Scene nav is Character + Roleplay. */
export const APP_NAV_SCENE_ALIASES: AppNavLink[] = [
  { href: '/background', label: 'Background', description: 'Environment-only — no people' },
  { href: '/pet', label: 'Pet', description: 'Dogs, cats & more' },
  { href: '/fantasy', label: 'Fantasy', description: 'Magic & myth' },
];

export function flattenAppNavLinks(groups: AppNavGroup[] = APP_NAV_GROUPS): AppNavLink[] {
  const links = groups.flatMap(group => group.links);
  const seen = new Set(links.map(link => link.href.split('?')[0] ?? link.href));
  for (const alias of APP_NAV_SCENE_ALIASES) {
    const path = alias.href.split('?')[0] ?? alias.href;
    if (seen.has(path)) {
      continue;
    }
    seen.add(path);
    links.push(alias);
  }
  return links;
}

/**
 * Append plugin-contributed links into the Library group, skipping hrefs already
 * present in the catalog (path match, query ignored).
 */
export function mergePluginLinksIntoNav(
  groups: AppNavGroup[] = APP_NAV_GROUPS,
  pluginLinks: AppNavLink[]
): AppNavGroup[] {
  if (!pluginLinks.length) {
    return groups;
  }
  const existing = new Set(
    groups.flatMap(group => group.links.map(link => link.href.split('?')[0] ?? link.href))
  );
  const unique = pluginLinks.filter(link => {
    const path = link.href.split('?')[0] ?? link.href;
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
  const next = groups.map(group => {
    if (group.label !== 'Library' && group.label !== 'Tools') {
      return group;
    }
    merged = true;
    return { ...group, links: [...group.links, ...unique] };
  });
  if (merged) {
    return next;
  }
  return [...next, { label: 'Plugins', links: unique }];
}
