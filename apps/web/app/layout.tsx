import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "CaseVault — Claims",
  description: "Legal matter intelligence workspace: claims matrix & burden of proof",
};

const NAV: { href: string; label: string; live?: boolean }[] = [
  { href: "/claims", label: "Claims", live: true },
  { href: "/chronology", label: "Chronology" },
  { href: "/evidence", label: "Evidence" },
  { href: "/relief", label: "Relief" },
  { href: "/research", label: "Research" },
  { href: "/tasks", label: "Tasks" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <nav className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
              <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-6 px-6">
                <Link href="/" className="flex items-center gap-2 font-black tracking-tight text-slate-900">
                  <span className="grid h-6 w-6 place-items-center rounded bg-slate-900 text-[11px] text-white">C</span>
                  CaseVault
                </Link>
                <div className="flex items-center gap-1 text-sm">
                  {NAV.map((n) => (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={`rounded-md px-2.5 py-1 font-medium transition ${
                        n.live ? "text-slate-900 hover:bg-slate-100" : "text-slate-400 hover:text-slate-600"
                      }`}
                      title={n.live ? undefined : "Other modules land with their own waves"}
                    >
                      {n.label}
                      {n.live ? <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 align-middle" /> : null}
                    </Link>
                  ))}
                </div>
                <div className="ml-auto text-[11px] font-medium uppercase tracking-widest text-slate-400">
                  NY · Wave 3
                </div>
              </div>
            </nav>
            <main className="flex-1">{children}</main>
            <footer className="border-t border-slate-200 py-4 text-center text-[11px] text-slate-400">
              CaseVault — reviewed proof graph · local-first · evidence in <code>data/</code> never leaves this machine
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
