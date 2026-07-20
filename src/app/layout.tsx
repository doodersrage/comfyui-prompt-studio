import type { Metadata } from "next";
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
    >
      <body className="relative min-h-full overflow-x-hidden text-[var(--text-primary)]">
        <AmbientBackground />
        <ThemeInit />
        <TabSyncInit />
        <AuthProvider>
          <div className="relative z-[1] min-h-full lg:pl-[var(--sidebar-width)]">
            <AppNav />
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
