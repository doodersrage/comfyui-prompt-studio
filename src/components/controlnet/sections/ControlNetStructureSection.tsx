'use client';

import { ToolSection, accentButtonClass, accentFocusClass } from '@/components/ui/ToolPageShell';
import { FieldLabel } from '@/components/ui/Field';
import { PrimaryButton } from '@/components/ui/Button';
import { CONTROLNET_ACCENT } from '@/components/controlnet/controlnet-tool-shared';

type Props = {
  mounted: boolean;
  subject: string;
  setSubject: (value: string) => void;
  scene: string;
  setScene: (value: string) => void;
  detailNotes: string;
  setDetailNotes: (value: string) => void;
  refFile: File | null;
  loading: boolean;
  error: string | null;
  generate: () => void | Promise<void>;
};

export function ControlNetStructureSection({
  mounted,
  subject,
  setSubject,
  scene,
  setScene,
  detailNotes,
  setDetailNotes,
  refFile,
  loading,
  error,
  generate,
}: Props) {
  return (
    <ToolSection title="Structure description">
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="controlnet-subject">Subject structure</FieldLabel>
          <textarea
            id="controlnet-subject"
            value={subject}
            onChange={event => setSubject(event.target.value)}
            rows={4}
            className={`ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body ${accentFocusClass(CONTROLNET_ACCENT)}`}
            placeholder="e.g. woman standing, weight on left leg, arms crossed — or leave blank when using image"
          />
        </div>
        <div>
          <FieldLabel htmlFor="controlnet-scene">Scene context (optional)</FieldLabel>
          <input
            id="controlnet-scene"
            value={scene}
            onChange={event => setScene(event.target.value)}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
            placeholder="e.g. narrow alley, low camera angle"
          />
        </div>
        <div>
          <FieldLabel htmlFor="controlnet-detail">Extra constraints (optional)</FieldLabel>
          <input
            id="controlnet-detail"
            value={detailNotes}
            onChange={event => setDetailNotes(event.target.value)}
            className="ui-input w-full px-(--input-padding-x) py-(--input-padding-y) type-body"
          />
        </div>
        <PrimaryButton
          accentClassName={accentButtonClass(CONTROLNET_ACCENT)}
          data-action="primary-generate"
          loading={loading}
          disabled={!mounted || (!subject.trim() && !refFile)}
          onClick={() => void generate()}
          loadingLabel="Building ControlNet prompt"
        >
          Build ControlNet prompt
        </PrimaryButton>
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>
    </ToolSection>
  );
}
