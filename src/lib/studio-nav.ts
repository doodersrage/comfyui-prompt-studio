/** Studio tab catalog for deep links + command palette. */

export type StudioTabId =
  | "history"
  | "compare"
  | "catalog"
  | "templates"
  | "presets"
  | "diff"
  | "iteration"
  | "projects"
  | "portfolio"
  | "campaign"
  | "analytics"
  | "experiments";

export type StudioTabDefinition = {
  id: StudioTabId;
  label: string;
  group: string;
  description: string;
};

export const STUDIO_TABS: StudioTabDefinition[] = [
  {
    id: "history",
    label: "History",
    group: "History",
    description: "Saved prompts and regenerations",
  },
  {
    id: "iteration",
    label: "Iteration tree",
    group: "History",
    description: "Prompt lineage forest",
  },
  {
    id: "projects",
    label: "Projects",
    group: "History",
    description: "Project folders and active project",
  },
  {
    id: "portfolio",
    label: "Portfolio",
    group: "Library",
    description: "Curated portfolio picks",
  },
  {
    id: "catalog",
    label: "Catalog",
    group: "Library",
    description: "Clothing and location catalog",
  },
  {
    id: "templates",
    label: "Templates",
    group: "Library",
    description: "Builtin and user prompt templates",
  },
  {
    id: "presets",
    label: "Presets",
    group: "Library",
    description: "Scene presets and packs",
  },
  {
    id: "compare",
    label: "Compare",
    group: "Analyze",
    description: "Side-by-side model compare",
  },
  {
    id: "campaign",
    label: "Campaign",
    group: "Analyze",
    description: "Campaign batches and reviews",
  },
  {
    id: "analytics",
    label: "Analytics",
    group: "Analyze",
    description: "Usage and rating analytics",
  },
  {
    id: "diff",
    label: "Diff",
    group: "Analyze",
    description: "Prompt word diff",
  },
  {
    id: "experiments",
    label: "Experiments",
    group: "Experiments",
    description: "A/B and experiment notes",
  },
];

export function isStudioTabId(value: string | null | undefined): value is StudioTabId {
  return STUDIO_TABS.some((tab) => tab.id === value);
}

export function studioTabHref(tab: StudioTabId): string {
  return tab === "history" ? "/studio" : `/studio?tab=${tab}`;
}
