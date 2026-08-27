import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import MobileStudioShell from '@/components/mobile/MobileStudioShell';

export const metadata: Metadata = {
  title: 'Mobile Studio',
  description:
    'Phone companion: capture a character plate, watch the queue, rate stills, and Play stills from photo. Cut film and Fitting/Day live on the desk app.',
  manifest: '/manifest-mobile.json',
  appleWebApp: {
    capable: true,
    title: 'Mobile Studio',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
    { media: '(prefers-color-scheme: light)', color: '#f3f4f8' },
  ],
};

export default function MobileStudioLayout({ children }: { children: ReactNode }) {
  return <MobileStudioShell>{children}</MobileStudioShell>;
}
