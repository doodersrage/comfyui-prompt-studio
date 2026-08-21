'use client';

import { Button } from '@/components/ui/Button';

export default function VisionScanButton({
  disabled,
  scanning,
  onClick,
}: {
  disabled?: boolean;
  scanning?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={disabled || scanning}
      loading={scanning}
      loadingLabel="Scanning still"
      onClick={onClick}
    >
      Scan with vision
    </Button>
  );
}
