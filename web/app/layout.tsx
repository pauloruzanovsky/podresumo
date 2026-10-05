import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Serifada pras citações literais e títulos de livro: é a fala de alguém
// sobre um livro, e deve parecer página, não painel.
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    // As páginas definem só o próprio nome; o sufixo vem daqui.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "pt_BR",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="w-full">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} antialiased max-w-300 mx-auto`}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="max-w-[1200px] mx-auto px-8 lg:px-12 h-14 flex items-center justify-between">
            <Link href="/" className="text-lg font-bold tracking-tight">
              Pod<span className="text-accent-light">Resumo</span>
            </Link>
            {/* "Descobrir" apontava pro mesmo lugar que o logo. Episódios só
                existia no rodapé. */}
            <nav className="flex items-center gap-1">
              {[
                { href: "/biblioteca", rotulo: "Livros" },
                { href: "/episodios", rotulo: "Episódios" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground transition-colors"
                >
                  {item.rotulo}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {/* Content */}
        <main className="relative z-10 max-w-300 justify-center mx-auto px-8 lg:px-12 py-12">
          {children}
        </main>

        {/* Footer */}
        <footer className="relative z-10 border-t border-border mt-20">
          <div className="max-w-300 mx-auto px-8 lg:px-12 py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-muted leading-relaxed max-w-md">
              <span className="font-semibold text-foreground">PodResumo</span>{" "}
              — os livros citados nos podcasts, com o minuto de cada menção.
              Extraído por IA a partir das transcrições; pode conter erros.
            </p>
            <nav className="flex items-center gap-5 text-xs text-muted">
              <Link href="/biblioteca" className="hover:text-foreground transition-colors">
                Livros
              </Link>
              <Link href="/episodios" className="hover:text-foreground transition-colors">
                Episódios
              </Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
