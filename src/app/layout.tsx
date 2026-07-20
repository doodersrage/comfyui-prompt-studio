import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "@/components/AppNav";
import CommandPalette from "@/components/CommandPalette";
import { AuthProvider } from "@/hooks/useAuth";
import ComfyGalleryBackgroundPoller from "@/components/ComfyGalleryBackgroundPoller";
import UserScopeInit from "@/components/UserScopeInit";
import ScheduledBatchRunner from "@/components/ScheduledBatchRunner";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import AutoStorageSyncInit from "@/components/AutoStorageSyncInit";
import GalleryPwaRegister from "@/components/GalleryPwaRegister";
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
      <body className="min-h-full overflow-x-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
        <AuthProvider>
          <div className="min-h-full lg:pl-[var(--sidebar-width)]">
            <AppNav />
            <ComfyGalleryBackgroundPoller />
            <UserScopeInit />
            <ScheduledBatchRunner />
            <KeyboardShortcuts />
            <CommandPalette />
            <AutoStorageSyncInit />
            <GalleryPwaRegister />
            {children}
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
