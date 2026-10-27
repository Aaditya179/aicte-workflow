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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <LanguageProvider>
          <Suspense fallback={<div className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1">{children}</main>
          <HelpDrawer />
          <footer className="py-4 border-t border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900">
            Advisory only — final decisions rest with the competent authority.
          </footer>
        </LanguageProvider>
      </body>
    </html>
  );
}
