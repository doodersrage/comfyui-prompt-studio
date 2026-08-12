'use client';

import { useEffect } from 'react';
import SystemPageShell from '@/components/ui/SystemPageShell';
import { Button } from '@/components/ui/Button';

export default function NotFound() {
  useEffect(() => {
    console.warn('404 page accessed');
  }, []);

  return (
    <SystemPageShell
      overline="Not found"
      title="Page not found"
      description="The page you're looking for doesn't exist or has been moved."
    >
      <Button variant="secondary" onClick={() => (window.location.href = '/')}>
        Go home
      </Button>
    </SystemPageShell>
  );
}
