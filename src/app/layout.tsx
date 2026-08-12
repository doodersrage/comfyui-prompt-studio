import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import ThemeInit from '@/components/ThemeInit';
import BrowserStorageInit from '@/components/BrowserStorageInit';
import TabSyncInit from '@/components/TabSyncInit';
import AmbientBackground from '@/components/AmbientBackground';
import AppNav from '@/components/AppNav';
import { AuthProvider } from '@/hooks/useAuth';
import ComfyGalleryBackgroundPoller from '@/components/ComfyGalleryBackgroundPoller';
import UserScopeInit from '@/components/UserScopeInit';
import AutoStorageSyncInit from '@/components/AutoStorageSyncInit';
import NsfwGeneratorPluginInit from '@/components/NsfwGeneratorPluginInit';
import PluginRuntimeInit from '@/components/PluginRuntimeInit';
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

/** Display face for tool titles and branded moments — soft optical sizing, not a default UI sans. */
const fraunces = Fraunces({
  variable: '--font-display',
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
    apple: [{ url: '/apple-icon', type: 'image/png' }],
    shortcut: ['/icon.svg'],
  },
  openGraph: {
    title: 'Prompt Studio',
    description:
      'Prompt, queue, and gallery studio for ComfyUI — image, video, audio, and 3D workflows.',
    siteName: 'Prompt Studio',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prompt Studio',
    description:
      'Prompt, queue, and gallery studio for ComfyUI — image, video, audio, and 3D workflows.',
  },
};

// Add themeColor directly to viewport to avoid flicker on initial load
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0c0c10' },
    { media: '(prefers-color-scheme: light)', color: '#f3f4f8' },
  ],
};

// Inline script for initial hydration to prevent FOUC
const themeInitScript = `(function(){try{var theme=localStorage.getItem("comfy-app-theme-v1");if(theme){document.documentElement.dataset.theme=theme.replace(/^"|"$/g,"")==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme.replace(/^"|"$/g,"");document.documentElement.style.colorScheme=document.documentElement.dataset.theme;}var ambient=localStorage.getItem("comfy-ambient-intensity-v1");if(ambient){document.documentElement.dataset.ambient=ambient.replace(/^"|"$/g,"");}var density=localStorage.getItem("comfy-ui-density-v1");if(density){document.documentElement.dataset.density=density.replace(/^"|"$/g,"");}var calm=localStorage.getItem("comfy-calm-ui-v1");if(calm){var c=calm.replace(/^"|"$/g,"");document.documentElement.dataset.calm=(c==="1"||c==="true")?"true":"false";}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
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
        <BrowserStorageInit />
        <TabSyncInit />
        <AuthProvider>
          <div className="relative z-[1] min-h-full lg:pl-[var(--sidebar-width)]">
            <Suspense
              fallback={
                <div
                  className="sticky top-0 z-40 border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base)_82%,transparent)] backdrop-blur-md lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:w-[var(--sidebar-width)] lg:border-b-0 lg:border-r"
                  aria-hidden
                >
                  <div className="flex h-14 items-center gap-3 px-4 lg:h-auto lg:flex-col lg:items-stretch lg:gap-4 lg:p-5">
                    <div className="h-8 w-8 shrink-0 rounded-[22%] bg-[var(--bg-active)]" />
                    <div className="hidden h-3 w-28 rounded-[var(--radius-full)] bg-[var(--bg-active)] lg:block" />
                    <div className="mt-2 hidden space-y-2 lg:block">
                      <div className="h-8 w-full rounded-[var(--radius-md)] bg-[var(--bg-subtle)]" />
                      <div className="h-8 w-full rounded-[var(--radius-md)] bg-[var(--bg-subtle)]" />
                      <div className="h-8 w-4/5 rounded-[var(--radius-md)] bg-[var(--bg-subtle)]" />
                    </div>
                  </div>
                </div>
              }
            >
              <AppNav />
            </Suspense>
            <ComfyGalleryBackgroundPoller />
            <UserScopeInit />
            <AutoStorageSyncInit />
            <NsfwGeneratorPluginInit />
            <PluginRuntimeInit />
            <DeferredShellClient />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
