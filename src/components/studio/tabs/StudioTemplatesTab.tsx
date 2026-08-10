'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import type { StudioToolCache } from '@/lib/settings-cache';
import type { UserPromptTemplate } from '@/lib/user-templates';
import { BUILTIN_PROMPT_TEMPLATES } from '@/lib/prompt-templates';
import {
  createUserTemplate,
  deleteUserTemplate,
  loadUserTemplates,
  upsertUserTemplate,
} from '@/lib/user-templates';
import { ToolContentPanel, ToolSection, accentButtonClass } from '@/components/ui/ToolPageShell';
import type { ToolAccent } from '@/lib/tool-theme';
import { FieldLabel } from '@/components/ui/Field';
import { Button, PrimaryButton } from '@/components/ui/Button';
import { EmptyState, StudioTabSkeleton } from '@/components/ui/ViewState';

const EnhancedPromptResult = dynamic(() => import('@/components/LazyEnhancedPromptResult'), {
  loading: () => <StudioTabSkeleton />,
});

export type PromptTemplateView = {
  id: string;
  label: string;
  template: string;
  defaultPortraitStyle?: 'portrait' | 'full-body' | 'action';
};

export type StudioTemplatesTabProps = {
  accent: ToolAccent;
  toolSettings: StudioToolCache;
  template: PromptTemplateView | undefined;
  filledTemplate: string;
  userTemplates: UserPromptTemplate[];
  customTemplateName: string;
  copied: boolean;
  onCustomTemplateNameChange: (name: string) => void;
  onUserTemplatesChange: (templates: UserPromptTemplate[]) => void;
  onUpdateToolSettings: (partial: Partial<StudioToolCache>) => void;
  onBackupStatusChange: (status: string) => void;
  onCopy: (text: string) => void;
};

export default function StudioTemplatesTab({
  accent,
  toolSettings,
  template,
  filledTemplate,
  userTemplates,
  customTemplateName,
  copied,
  onCustomTemplateNameChange,
  onUserTemplatesChange,
  onUpdateToolSettings,
  onBackupStatusChange,
  onCopy,
}: StudioTemplatesTabProps) {
  return (
    <ToolSection>
      <div className="space-y-2">
        <FieldLabel htmlFor="studio-template-select">Template</FieldLabel>
        <select
          id="studio-template-select"
          value={toolSettings.templateId ?? 'duo-sport-race'}
          onChange={event => onUpdateToolSettings({ templateId: event.target.value })}
          className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
        >
          <optgroup label="Built-in">
            {BUILTIN_PROMPT_TEMPLATES.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </optgroup>
          {userTemplates.length > 0 && (
            <optgroup label="Custom">
              {userTemplates.map(entry => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {!template ? (
        <EmptyState
          icon="template"
          title="Template not found"
          description="The selected template may have been deleted. Choose a built-in template from the list above to continue editing slots and preview."
          action={{
            label: 'Use default template',
            onClick: () => onUpdateToolSettings({ templateId: 'duo-sport-race' }),
          }}
        />
      ) : (
        <>
          <div className="grid gap-3 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
            <input
              id="studio-custom-template-name"
              value={customTemplateName}
              onChange={event => onCustomTemplateNameChange(event.target.value)}
              placeholder="Custom template name"
              className="ui-input px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
            />
            <PrimaryButton
              accentClassName={accentButtonClass(accent)}
              disabled={!customTemplateName.trim() || !filledTemplate.trim()}
              onClick={() => {
                const created = createUserTemplate({
                  name: customTemplateName,
                  template: filledTemplate,
                  defaultPortraitStyle: template.defaultPortraitStyle,
                });
                upsertUserTemplate(created);
                onUserTemplatesChange(loadUserTemplates());
                onUpdateToolSettings({ templateId: created.id });
                onCustomTemplateNameChange('');
                onBackupStatusChange(`Saved custom template “${created.label}”.`);
              }}
            >
              Save preview as custom template
            </PrimaryButton>
          </div>

          {userTemplates.some(entry => entry.id === template.id) && (
            <Button
              variant="danger"
              size="sm"
              className="type-caption"
              onClick={() => {
                deleteUserTemplate(template.id);
                onUserTemplatesChange(loadUserTemplates());
                onUpdateToolSettings({ templateId: 'duo-sport-race' });
                onBackupStatusChange(`Deleted template “${template.label}”.`);
              }}
            >
              Delete custom template
            </Button>
          )}

          <ToolContentPanel>
            <p className="type-code whitespace-pre-wrap !bg-transparent !p-0 text-[var(--text-secondary)]">
              {template.template}
            </p>
          </ToolContentPanel>

          {Array.from(template.template.matchAll(/\{\{(\w+)\}\}/g), match => match[1]!).length ===
          0 ? (
            <EmptyState
              compact
              icon="template"
              title="No template slots"
              description="This template has no {{slot}} placeholders. Edit the template text or pick another template to fill variables."
              action={{
                label: 'Browse built-ins',
                onClick: () => document.getElementById('studio-template-select')?.focus(),
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from(template.template.matchAll(/\{\{(\w+)\}\}/g), match => match[1]!).map(
                slot => (
                  <div key={slot} className="space-y-2">
                    <FieldLabel htmlFor={`studio-template-slot-${slot}`}>{slot}</FieldLabel>
                    <input
                      id={`studio-template-slot-${slot}`}
                      value={toolSettings.templateSlots?.[slot] ?? ''}
                      onChange={event =>
                        onUpdateToolSettings({
                          templateSlots: {
                            ...toolSettings.templateSlots,
                            [slot]: event.target.value,
                          },
                        })
                      }
                      className="ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body"
                    />
                  </div>
                )
              )}
            </div>
          )}

          <EnhancedPromptResult
            output={filledTemplate}
            provider={null}
            copied={copied}
            onCopy={() => onCopy(filledTemplate)}
            extraMeta="template preview"
          />

          <Link
            href={`/character?mode=duo&hints=${encodeURIComponent(filledTemplate)}`}
            className="ui-btn-primary inline-flex w-fit"
          >
            Open in Character (duo)
          </Link>
        </>
      )}
    </ToolSection>
  );
}
