'use client';

import { useEffect } from 'react';
import SystemPageShell from '@/components/ui/SystemPageShell';
import { Button } from '@/components/ui/Button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <SystemPageShell
      overline="Error"
      title="Something went wrong"
      description={
        error.message?.trim()
          ? `${error.message.trim()}${error.digest ? ` (ref ${error.digest})` : ''}`
          : error.digest
            ? `An unexpected error occurred (ref ${error.digest}). Try again, or reload the page.`
            : 'An unexpected error occurred. Try again, or reload the page.'
      }
    >
      <Button variant="secondary" onClick={() => reset()}>
        Try again
      </Button>
    </SystemPageShell>
  );
}
