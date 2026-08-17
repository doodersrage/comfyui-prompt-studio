import type { Metadata, Viewport } from 'next';
import { Fraunces, Geist, Geist_Mono } from 'next/font/google';
import ThemeInit from '@/components/ThemeInit';
import BrowserStorageInit from '@/components/BrowserStorageInit';
import TabSyncInit from '@/components/TabSyncInit';
import AmbientBackground from '@/components/AmbientBackground';
import AppShell from '@/components/AppShell';
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
  description: 'Prompt, queue, and gallery studio for image, video, audio, and 3D workflows.',
  applicationName: 'Prompt Studio',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon', type: 'image/png' }],
    shortcut: ['/icon.svg'],
  },
  openGraph: {
    title: 'Prompt Studio',
    description: 'Prompt, queue, and gallery studio for image, video, audio, and 3D workflows.',
    siteName: 'Prompt Studio',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Prompt Studio',
    description: 'Prompt, queue, and gallery studio for image, video, audio, and 3D workflows.',
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
const themeInitScript = `(function(){try{var theme=localStorage.getItem("comfy-app-theme-v1");if(theme){document.documentElement.dataset.theme=theme.replace(/^"|"$/g,"")==="auto"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):theme.replace(/^"|"$/g,"");document.documentElement.style.colorScheme=document.documentElement.dataset.theme;}var ambient=localStorage.getItem("comfy-ambient-intensity-v1");if(ambient){document.documentElement.dataset.ambient=ambient.replace(/^"|"$/g,"");}var density=localStorage.getItem("comfy-ui-density-v1");if(density){document.documentElement.dataset.density=density.replace(/^"|"$/g,"");}var calm=localStorage.getItem("comfy-calm-ui-v1");if(calm){var c=calm.replace(/^"|"$/g,"");document.documentElement.dataset.calm=(c==="1"||c==="true")?"true":"false";}var workspace=localStorage.getItem("comfy-workspace-mode-v1");if(workspace){var w=workspace.replace(/^"|"$/g,"");if(w==="simple"||w==="play"||w==="studio"||w==="full"){document.documentElement.dataset.workspace=w;}}}catch(e){}})();`;

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
          <AppShell>
            <ComfyGalleryBackgroundPoller />
            <UserScopeInit />
            <AutoStorageSyncInit />
            <NsfwGeneratorPluginInit />
            <PluginRuntimeInit />
            <DeferredShellClient />
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
