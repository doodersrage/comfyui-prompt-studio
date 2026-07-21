export type SettingsTab =
  | "overview"
  | "llm"
  | "comfyui"
  | "automation"
  | "advanced"
  | "data"
  | "users";

export type SettingsTabDefinition = {
  id: SettingsTab;
  label: string;
  description: string;
};

export const SETTINGS_TABS: SettingsTabDefinition[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Service health and server environment (.env.local).",
  },
  {
    id: "llm",
    label: "LLM",
    description: "Server snapshot, session model overrides, and vision tags.",
  },
  {
    id: "comfyui",
    label: "ComfyUI",
    description: "Presets, workflows, prompt quality, VRAM guard, and injection.",
  },
  {
    id: "automation",
    label: "Automation",
    description: "Webhooks, scheduled batch, and avoided tokens.",
  },
  {
    id: "advanced",
    label: "Advanced",
    description: "Recipes, negative learner, shootout, usage, and storage sync.",
  },
  {
    id: "data",
    label: "Data",
    description: "Backup, settings export, gallery preview, and descriptors.",
  },
  {
    id: "users",
    label: "Users",
    description: "Accounts, groups, and per-feature access blocks.",
  },
];

export function normalizeSettingsTab(value: string | null | undefined): SettingsTab {
  if (SETTINGS_TABS.some((tab) => tab.id === value)) {
    return value as SettingsTab;
  }
  return "overview";
}

export function settingsTabHref(tab: SettingsTab): string {
  return tab === "overview" ? "/settings" : `/settings?tab=${tab}`;
}
