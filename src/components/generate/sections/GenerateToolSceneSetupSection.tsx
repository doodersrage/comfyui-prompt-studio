'use client';

import dynamic from 'next/dynamic';
import { HistoryHintSeedPanel } from '@/components/scene-tool/HistoryHintSeedPanel';
import { modelUsesTagAssist } from '@/lib/tag-assist';
import { accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldDivider } from '@/components/ui/Field';
import { TextArea } from '@/components/ui/Field';
import type { useGenerateToolOrchestration } from '@/hooks/useGenerateToolOrchestration';

const ACCENT = 'brand' as const;

const TagAssistToolbar = dynamic(() => import('@/components/TagAssistToolbar'), {
  ssr: false,
  loading: () => (
    <div className="h-12 animate-pulse rounded-xl bg-[var(--bg-muted)]/40" aria-hidden />
  ),
});

type Props = Pick<
  ReturnType<typeof useGenerateToolOrchestration>,
  | 'toolSettings'
  | 'updateToolSettings'
  | 'mode'
  | 'input'
  | 'setInput'
  | 'hintSource'
  | 'historySeedScope'
  | 'queueModel'
  | 'setHintSource'
>;

export function GenerateToolHintInputSection({
  toolSettings,
  updateToolSettings,
  mode,
  input,
  setInput,
  hintSource,
  historySeedScope,
  queueModel,
  setHintSource,
}: Props) {
  return (
    <>
      <HistoryHintSeedPanel
        tool="generate"
        compact
        hintSource={hintSource}
        historySeedScope={historySeedScope}
        hints={input}
        randomTheme={toolSettings.genre}
        lastHistorySeedEntryId={toolSettings.lastHistorySeedEntryId}
        onHintSourceChange={setHintSource}
        onHistorySeedScopeChange={scope => updateToolSettings({ historySeedScope: scope })}
        onHintsChange={setInput}
        onRandomThemeChange={value => updateToolSettings({ genre: value })}
        onHistorySeedApplied={result => {
          setInput(result.hints);
          updateToolSettings({ lastHistorySeedEntryId: result.entryId });
        }}
        accentFocusClassName={accentFocusClass(ACCENT)}
      />

      {hintSource !== 'random' && mode === 'positive' ? (
        <>
          <FieldDivider />
          <label htmlFor="edit-input" className="text-sm font-medium text-[var(--text-primary)]">
            Scene idea or keywords
          </label>
          <TextArea
            id="edit-input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
              }
            }}
            placeholder="e.g. neon alley, rain, black cat — any topic or words to paint into a scene"
            rows={5}
            className={`text-base ${accentFocusClass(ACCENT)}`}
          />
          {modelUsesTagAssist(queueModel) ? (
            <TagAssistToolbar value={input} onChange={setInput} textareaId="edit-input" />
          ) : null}
        </>
      ) : null}
    </>
  );
}
