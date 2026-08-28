'use client';

import RoleplayBibleEditor from '@/components/RoleplayBibleEditor';
import { Button } from '@/components/ui/Button';
import { ToolSection, accentFocusClass } from '@/components/ui/ToolPageShell';
import { formatRoleplayBio, type RoleplayBio } from '@/lib/roleplay';

const ACCENT = 'amber' as const;

export type RoleplayBioSectionProps = {
  bio: RoleplayBio;
  ownBibleOpen: boolean;
  characterName: string | undefined;
  busy: boolean;
  onOpenEditor: () => void;
  onApplyBible: (nextBio: RoleplayBio) => void;
};

export default function RoleplayBioSection({
  bio,
  ownBibleOpen,
  characterName,
  busy,
  onOpenEditor,
  onApplyBible,
}: RoleplayBioSectionProps) {
  return (
    <ToolSection title={`${bio.name} · character bible`}>
      <p className="text-sm whitespace-pre-wrap text-[var(--text-secondary)]">
        {formatRoleplayBio(bio)}
      </p>
      {ownBibleOpen ? (
        <RoleplayBibleEditor
          key={`${bio.name}-${bio.look}-${bio.personality}`}
          initial={bio}
          characterName={characterName}
          disabled={busy}
          accentClass={accentFocusClass(ACCENT)}
          applyLabel="Update bible"
          onApply={onApplyBible}
        />
      ) : (
        <Button variant="ghost" disabled={busy} onClick={onOpenEditor}>
          Edit bible
        </Button>
      )}
    </ToolSection>
  );
}
