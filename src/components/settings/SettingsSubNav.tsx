'use client';

import type { ReactNode } from 'react';
import { ChipButton } from '@/components/ui/Field';
import { SETTINGS_TABS, type SettingsTab, type SettingsTabDefinition } from '@/lib/settings-nav';
import { ToolMetaPanel } from '@/components/ui/ToolPageShell';

export default function SettingsSubNav({
  activeTab,
  onTabChange,
  tabs = SETTINGS_TABS,
  footer,
}: {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  tabs?: SettingsTabDefinition[];
  footer?: ReactNode;
}) {
  const active = tabs.find(tab => tab.id === activeTab);

  return (
    <ToolMetaPanel className="sticky top-20 z-20 md:sticky md:top-24">
      <nav aria-label="Settings sections">
        {/* Mobile: horizontal chips */}
        <div className="-mx-1 overflow-x-auto px-1 pb-1 md:hidden">
          <div className="flex flex-wrap gap-2">
            {tabs.map(tab => (
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
          {footer}
        </div>

        {/* md+: vertical side list */}
        <div className="hidden md:block">
          <p className="type-overline mb-3 text-[var(--text-muted)]">Sections</p>
          <ul className="space-y-1">
            {tabs.map(tab => {
              const isActive = tab.id === activeTab;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`ui-settings-tab ${isActive ? 'is-active' : ''}`.trim()}
                  >
                    <span className="type-heading block">{tab.label}</span>
                    <span className="type-caption mt-0.5 block text-[var(--text-muted)]">
                      {tab.description}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {footer}
        </div>
      </nav>
    </ToolMetaPanel>
  );
}
