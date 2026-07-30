'use client';

import { applyTagAssistToSelection } from '@/lib/tag-assist';

type TagAssistToolbarProps = {
  value: string;
  onChange: (value: string) => void;
  textareaId?: string;
};

export default function TagAssistToolbar({
  value,
  onChange,
  textareaId = 'edit-input',
}: TagAssistToolbarProps) {
  const apply = (transform: 'emphasis' | 'deemphasis' | 'tags') => {
    const element = document.getElementById(textareaId) as HTMLTextAreaElement | null;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const result = applyTagAssistToSelection(value, start, end, transform);
    onChange(result.nextValue);
    window.requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(result.nextSelectionStart, result.nextSelectionEnd);
    });
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => apply('emphasis')}
        className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        Emphasize selection
      </button>
      <button
        type="button"
        onClick={() => apply('deemphasis')}
        className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        De-emphasize selection
      </button>
      <button
        type="button"
        onClick={() => apply('tags')}
        className="rounded-full border border-zinc-700 px-3 py-1 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
      >
        Tags from selection
      </button>
    </div>
  );
}
