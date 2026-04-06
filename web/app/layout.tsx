import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
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
  title: "PodResumo",
  description: "Resumos inteligentes de podcasts para quem quer aprender mais em menos tempo.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="w-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased max-w-300 mx-auto`}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-accent/10 bg-background/80 backdrop-blur-xl">
          <div className="max-w-[1200px] mx-auto px-8 lg:px-12 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Pod<span className="text-accent-light">Resumo</span>
            </Link>
            <nav className="flex items-center gap-1">
              <Link
                href="/"
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground transition-colors"
              >
                Episódios
              </Link>
              <Link
                href="/lessons"
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground transition-colors"
              >
                Lessons
              </Link>
              <Link
                href="/biblioteca"
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground transition-colors"
              >
                Biblioteca
              </Link>
            </nav>
          </div>
        </header>

        {/* Content */}
        <main className="relative z-10 max-w-300 justify-center mx-auto px-8 lg:px-12 py-12">
          {children}
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-accent/5 mt-20">
          <div className="max-w-300 mx-auto px-8 lg:px-12 py-8 flex items-center justify-between">
            <span className="text-xs text-muted/50">
              PodResumo — Gerado por IA a partir de transcrições
            </span>
            <span className="text-xs text-muted/30 font-mono">
              Prefect + Claude + Supabase
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
