import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Suspense } from "react";
import Navbar from "@/components/Navbar";
import HelpDrawer from "@/components/HelpDrawer";
import { LanguageProvider } from "@/context/LanguageContext";

export const metadata: Metadata = {
  title: "AICTE Workflow & SLA Monitoring",
  description: "AICTE Smart Automation & Real-Time SLA Monitoring System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      style={{ backgroundColor: '#FAF7F2', colorScheme: 'light' }}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased bg-[#FAF7F2]`}
    >
      <body
        style={{ backgroundColor: '#FAF7F2', colorScheme: 'light' }}
        className="min-h-full flex flex-col bg-[#FAF7F2] text-[#1C1917] selection:bg-[#FBF0E4] selection:text-[#C25E26] bg-grid-texture antialiased"
      >
        <LanguageProvider>
          <Suspense fallback={<div className="h-16 bg-[#FAF7F2] border-b border-[#E8E2D8]" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1 bg-[#FAF7F2] bg-grid-texture">{children}</main>
          <HelpDrawer />
          <footer className="py-4 border-t border-[#E8E2D8] text-center text-xs text-stone-500 bg-[#FAF7F2]/90 backdrop-blur-xs">
            Advisory only — final decisions rest with the competent authority.
          </footer>
        </LanguageProvider>
      </body>
    </html>
  );
}
