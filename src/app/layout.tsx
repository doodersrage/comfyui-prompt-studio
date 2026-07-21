import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeInit from "@/components/ThemeInit";
import TabSyncInit from "@/components/TabSyncInit";
import AmbientBackground from "@/components/AmbientBackground";
import AppNav from "@/components/AppNav";
import { AuthProvider } from "@/hooks/useAuth";
import ComfyGalleryBackgroundPoller from "@/components/ComfyGalleryBackgroundPoller";
import UserScopeInit from "@/components/UserScopeInit";
import AutoStorageSyncInit from "@/components/AutoStorageSyncInit";
import DeferredShellClient from "@/components/DeferredShellClient";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ComfyUI Image Prompt Tools",
  description:
    "Generate and format prompts for SD, SDXL, SD3, Flux, Qwen Image, Hunyuan, and other ComfyUI image models.",
  manifest: "/manifest.json",
};

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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var raw=localStorage.getItem("comfy-app-theme-v1");var pref="auto";if(raw){var t=raw.replace(/^"|"$/g,"");if(t==="light"||t==="dark"||t==="auto"){pref=t;}}var resolved=pref==="auto"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):pref;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;var a=localStorage.getItem("comfy-ambient-intensity-v1");var ambient="subtle";if(a){var parsed=a.replace(/^"|"$/g,"");if(parsed==="off"||parsed==="subtle"||parsed==="normal"||parsed==="vivid"){ambient=parsed;}}document.documentElement.dataset.ambient=ambient;var d=localStorage.getItem("comfy-ui-density-v1");var density="comfortable";if(d){var dens=d.replace(/^"|"$/g,"");if(dens==="compact"||dens==="comfortable"){density=dens;}}document.documentElement.dataset.density=density;}catch(e){}})();`,
          }}
        />
      </head>
      <body className="relative min-h-full overflow-x-hidden text-[var(--text-primary)]">
        <AmbientBackground />
        <ThemeInit />
        <TabSyncInit />
        <AuthProvider>
          <div className="relative z-[1] min-h-full lg:pl-[var(--sidebar-width)]">
            <Suspense fallback={null}>
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
