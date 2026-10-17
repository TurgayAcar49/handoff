import type { Metadata } from "next";
import { Suspense } from "react";
import { Figtree, Geist_Mono, Instrument_Serif } from "next/font/google";
import { Providers } from "@/components/providers";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import "./globals.css";

const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Handoff",
    template: "%s · Handoff",
  },
  description:
    "Lock USDC in a job ticket on Arc. The payee is paid when the work is delivered.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${figtree.variable} ${instrument.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
            <Suspense
              fallback={<div className="h-56 animate-pulse rounded-xl border border-border bg-card" />}
            >
              {children}
            </Suspense>
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
