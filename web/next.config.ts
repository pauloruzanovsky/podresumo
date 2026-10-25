import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
  },
};

export default nextConfig;
