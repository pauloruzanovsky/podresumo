import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O retrato do banco (scripts/retrato.mjs) é lido com fs em lib/dados.ts;
  // sem isto ele não iria junto pras funções da Vercel.
  outputFileTracingIncludes: {
    "/**": ["./retrato/dados.json"],
  },
  // A biblioteca saiu: com um podcast só no site ela repetia a estante dele
  // (ver ESTANTE_PRINCIPAL em lib/podcasts). Redireciona aqui, antes da
  // página, pra o navegador e o Google receberem um 307 de verdade — feito
  // dentro da página, o loading.tsx já tinha começado a responder com 200.
  // A busca (?q=) segue junto. Temporário porque a biblioteca volta quando
  // houver mais de um podcast.
  async redirects() {
    return [
      {
        source: "/biblioteca",
        destination: "/podcast/os-socios#todos-os-livros",
        permanent: false,
      },
    ];
  },
  images: {
    // As miniaturas do YouTube já vêm leves; otimizá-las gastava a cota
    // grátis de transformações da Vercel (4,9 mil de 5 mil em nov/2026).
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
};

export default nextConfig;
