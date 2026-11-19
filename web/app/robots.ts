import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // ~400 visitas a cada 12 h sem trazer leitor, montando página por página
      // (CPU da Vercel estourou em nov/2026). Robôs de busca seguem liberados.
      { userAgent: "Amazonbot", disallow: "/" },
      // Robôs que só coletam pra treinar IA: em 18/11/2026 o meta-webindexer
      // (~5,5 mil acessos/dia) e o GPTBot (~2 mil) eram 3/4 do tráfego e
      // quase todas as ISR writes (cada página nova: 8 a 27 escritas de 8 KB).
      // Ficam liberados Google, Bing, os de busca que trazem leitor com link
      // (OAI-SearchBot, PerplexityBot) e os de preview (WhatsApp, Telegram).
      {
        userAgent: [
          "meta-webindexer",
          "meta-externalagent",
          "GPTBot",
          "CCBot",
          "ClaudeBot",
          "anthropic-ai",
          "Bytespider",
          "Google-Extended",
          "Applebot-Extended",
        ],
        disallow: "/",
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
