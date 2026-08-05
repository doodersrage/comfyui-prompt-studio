import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import ThemeInit from '@/components/ThemeInit';
import TabSyncInit from '@/components/TabSyncInit';
import AmbientBackground from '@/components/AmbientBackground';
import AppNav from '@/components/AppNav';
import { AuthProvider } from '@/hooks/useAuth';
import ComfyGalleryBackgroundPoller from '@/components/ComfyGalleryBackgroundPoller';
import UserScopeInit from '@/components/UserScopeInit';
import AutoStorageSyncInit from '@/components/AutoStorageSyncInit';
import DeferredShellClient from '@/components/DeferredShellClient';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Prompt Studio',
    template: '%s · Prompt Studio',
  },
  description:
    'Prompt, queue, and gallery studio for ComfyUI — image, video, audio, and 3D workflows.',
  applicationName: 'Prompt Studio',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: ['/icon.svg'],
  },
};

// Add themeColor directly to viewport to avoid flicker on initial load
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0b0f14' },
    { media: '(prefers-color-scheme: light)', color: '#0b0f14' },
  ],
};

// Inline script for initial hydration to prevent FOUC
const themeInitScript = `(function(){try{var theme=localStorage.getItem("comfy-app-theme-v1");if(theme){document.documentElement.dataset.theme=theme.replace(/^"|"$/g,"")==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme.replace(/^"|"$/g,"");document.documentElement.style.colorScheme=document.documentElement.dataset.theme;}var ambient=localStorage.getItem("comfy-ambient-intensity-v1");if(ambient){document.documentElement.dataset.ambient=ambient.replace(/^"|"$/g,"");}var density=localStorage.getItem("comfy-ui-density-v1");if(density){document.documentElement.dataset.density=density.replace(/^"|"$/g,"");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Inline script for initial hydration to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="relative min-h-full overflow-x-hidden text-[var(--text-primary)]"
        suppressHydrationWarning
      >
        <AmbientBackground />
        <ThemeInit />
        <TabSyncInit />
        <AuthProvider>
          <div className="relative z-[1] min-h-full lg:pl-[var(--sidebar-width)]">
            <Suspense fallback={<div className="h-16 bg-gray-900 animate-pulse"></div>}>
              <AppNav />
            </Suspense>
            <ComfyGalleryBackgroundPoller />
            <UserScopeInit />
            <AutoStorageSyncInit />
            <DeferredShellClient />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
