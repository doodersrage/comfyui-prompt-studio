import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNav from "@/components/AppNav";
import ComfyGalleryBackgroundPoller from "@/components/ComfyGalleryBackgroundPoller";
import ScheduledBatchRunner from "@/components/ScheduledBatchRunner";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import ServiceWorkerCleanup from "@/components/ServiceWorkerCleanup";
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
        <div className="min-h-full lg:pl-[var(--sidebar-width)]">
          <AppNav />
          <ComfyGalleryBackgroundPoller />
          <ScheduledBatchRunner />
          <KeyboardShortcuts />
          <ServiceWorkerCleanup />
          {children}
        </div>
      </body>
    </html>
  );
}
