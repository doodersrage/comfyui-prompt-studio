export type SettingsTab =
  | "overview"
  | "llm"
  | "comfyui"
  | "automation"
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
    description: "Session overrides for temperature and template fallback.",
  },
  {
    id: "comfyui",
    label: "ComfyUI",
    description: "Workflows, connection, queue params, and injection tokens.",
  },
  {
    id: "automation",
    label: "Automation",
    description: "Webhooks, scheduled batch, and avoided tokens.",
  },
  {
    id: "data",
    label: "Data",
    description: "Backup, sync, gallery preview, and shared descriptors.",
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
