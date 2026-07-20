"use client";

import { ChipButton } from "@/components/ui/Field";
import {
  SETTINGS_TABS,
  type SettingsTab,
} from "@/lib/settings-nav";
import { ToolMetaPanel } from "@/components/ui/ToolPageShell";

export default function SettingsSubNav({
  activeTab,
  onTabChange,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}) {
  const active = SETTINGS_TABS.find((tab) => tab.id === activeTab);

  return (
    <ToolMetaPanel className="sticky top-20 z-20">
      <nav aria-label="Settings sections">
        <div className="flex flex-wrap gap-2">
          {SETTINGS_TABS.map((tab) => (
            <ChipButton
              key={tab.id}
              active={tab.id === activeTab}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </ChipButton>
          ))}
        </div>
        {active ? <p className="type-caption mt-3">{active.description}</p> : null}
      </nav>
    </ToolMetaPanel>
  );
}
