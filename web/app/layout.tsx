import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import { ESTANTES } from "@/lib/podcasts";
import MenuEstantes from "@/components/MenuEstantes";
import Newsletter from "@/components/Newsletter";
import { IconePodlibris } from "@/components/Logo";
import LinkLogo from "@/components/LinkLogo";
import TrocaTema, { SCRIPT_TEMA } from "@/components/TrocaTema";
import PlayerTrecho from "@/components/PlayerTrecho";
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
    // suppressHydrationWarning: o SCRIPT_TEMA mexe no data-theme antes do React
    <html lang="pt-BR" className="w-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} antialiased max-w-300 mx-auto`}
      >
        {/* Header */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
          <div className="max-w-[1200px] mx-auto px-8 lg:px-12 h-14 flex items-center justify-between">
            <LinkLogo className="flex items-center gap-2 text-marca">
              <IconePodlibris className="h-7 w-auto" ondas="currentColor" />
              <span className="font-serif text-xl font-bold tracking-tight">{SITE_NAME}</span>
            </LinkLogo>
            {/* "Descobrir" apontava pro mesmo lugar que o logo. Episódios só
                existia no rodapé. */}
            <nav className="flex items-center sm:gap-1">
              <MenuEstantes />
              <Link
                href="/episodios"
                className="px-2 sm:px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:text-foreground transition-colors"
              >
                Episódios
              </Link>
              {/* A busca só existia na home. Um campo inteiro aqui não cabe no
                  celular: a lupa abre a página de busca, com o campo em foco. */}
              <Link
                href="/busca"
                aria-label="Buscar"
                title="Buscar"
                className="grid place-items-center w-9 h-9 rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
              >
                <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </Link>
              <TrocaTema />
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
              <span className="font-semibold text-foreground">{SITE_NAME}</span>{" "}
              — os livros citados nos podcasts, com o minuto de cada menção.
              Extraído por IA a partir das transcrições; pode conter erros.
              Como associado da Amazon, o {SITE_NAME} ganha com compras qualificadas.
            </p>
            <Newsletter variante="rodape" />
          </div>
          <div className="max-w-300 mx-auto px-8 lg:px-12 pb-8">
            <nav className="flex items-center gap-5 text-xs text-muted">
              <Link href={ESTANTES} className="hover:text-foreground transition-colors">
                Estantes
              </Link>
              <Link href="/episodios" className="hover:text-foreground transition-colors">
                Episódios
              </Link>
            </nav>
          </div>
        </footer>

        {/* "Ouvir o trecho" toca aqui, no minuto, sem sair do site */}
        <PlayerTrecho />

        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
