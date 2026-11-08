import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/" },
      // ~400 visitas a cada 12 h sem trazer leitor, montando página por página
      // (CPU da Vercel estourou em nov/2026). Robôs de busca seguem liberados.
      { userAgent: "Amazonbot", disallow: "/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
