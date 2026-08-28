'use client';

import { useId } from 'react';
import { Button } from '@/components/ui/Button';
import { FieldLabel, TextInput } from '@/components/ui/Field';
import type { LoraTrainPanelViewModel } from '@/components/settings/lora-train/useLoraTrainPanel';

type Props = Pick<
  LoraTrainPanelViewModel,
  | 'canEditTrainer'
  | 'prefs'
  | 'trigger'
  | 'setTrigger'
  | 'outputPath'
  | 'setOutputPath'
  | 'busy'
  | 'envFlags'
  | 'trainerHint'
  | 'persistPrefs'
  | 'refreshFromServer'
  | 'startJob'
>;

export function LoraTrainPanelForm({
  canEditTrainer,
  prefs,
  trigger,
  setTrigger,
  outputPath,
  setOutputPath,
  busy,
  envFlags,
  trainerHint,
  persistPrefs,
  refreshFromServer,
  startJob,
}: Props) {
  const formId = useId();

  return (
    <>
      <p className="text-sm text-[var(--text-muted)]">
        GPU training runs out of process. This panel owns the loop: start an external trainer
        (webhook or command), track jobs, then register the weight into the LoRA library with its
        trigger.
      </p>

      <p className="type-caption text-[var(--text-muted)]">{trainerHint}</p>
      <p className="type-caption text-[var(--text-muted)]">
        Env <code className="ui-inline-code">TRAINER_URL</code> /{' '}
        <code className="ui-inline-code">TRAINER_COMMAND</code> win until the Next.js process
        restarts. Settings values apply only when those env vars are unset. Studio never spawns a
        trainer from the browser.
      </p>
      {!canEditTrainer ? (
        <p className="type-caption text-[var(--tint-warning-text)]">
          Admin sign-in required to edit trainer URL or command.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-url`}>Trainer URL</FieldLabel>
          <TextInput
            id={`${formId}-url`}
            value={prefs.trainerUrl ?? ''}
            onChange={event => persistPrefs({ ...prefs, trainerUrl: event.target.value })}
            placeholder="http://127.0.0.1:7860/train"
            disabled={envFlags.envUrl || !canEditTrainer}
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-cmd`}>Trainer command</FieldLabel>
          <TextInput
            id={`${formId}-cmd`}
            value={prefs.trainerCommand ?? ''}
            onChange={event => persistPrefs({ ...prefs, trainerCommand: event.target.value })}
            placeholder="/path/to/train_network.py --config …"
            disabled={envFlags.envCommand || !canEditTrainer}
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-out`}>Output path / LoRA file</FieldLabel>
          <TextInput
            id={`${formId}-out`}
            value={outputPath}
            onChange={event => {
              setOutputPath(event.target.value);
              persistPrefs({ ...prefs, outputDir: event.target.value });
            }}
            placeholder="my_character_v1.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <FieldLabel htmlFor={`${formId}-base`}>Base model (optional)</FieldLabel>
          <TextInput
            id={`${formId}-base`}
            value={prefs.baseModel ?? ''}
            onChange={event => persistPrefs({ ...prefs, baseModel: event.target.value })}
            placeholder="qwen_image_2512_bf16.safetensors"
            className="font-mono text-sm"
          />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <FieldLabel htmlFor={`${formId}-trigger`}>Trigger word</FieldLabel>
          <TextInput
            id={`${formId}-trigger`}
            value={trigger}
            onChange={event => setTrigger(event.target.value)}
            placeholder="ohwx person"
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={prefs.activateOnRegister !== false}
          onChange={event => persistPrefs({ ...prefs, activateOnRegister: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Activate in session LoRA stack on register
      </label>
      <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <input
          type="checkbox"
          checked={prefs.autoQueueValidation === true}
          onChange={event => persistPrefs({ ...prefs, autoQueueValidation: event.target.checked })}
          className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
        />
        Auto-queue validation render when a train job registers
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          loading={busy}
          onClick={() => void startJob()}
        >
          Start train job
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void refreshFromServer()}
        >
          Refresh status
        </Button>
      </div>
    </>
  );
}
