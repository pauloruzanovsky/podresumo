import { NextResponse } from "next/server";
import { leToken } from "@/lib/confirmacao";
import { SITE_URL } from "@/lib/site";

/**
 * Segundo passo da dupla confirmação: o botão da página /confirmar posta
 * aqui, e só então o e-mail entra na lista. É POST de propósito: filtros de
 * e-mail abrem os links das mensagens, e um GET confirmaria sozinho.
 */
export async function POST(req: Request) {
  const chave = process.env.RESEND_API_KEY;
  const segredo = process.env.NEWSLETTER_SEGREDO;
  const segmento = process.env.RESEND_SEGMENT_ID;
  const volta = (estado: string) => NextResponse.redirect(`${SITE_URL}/confirmar?estado=${estado}`, 303);
  if (!chave || !segredo || !segmento) return volta("erro");

  const form = await req.formData();
  const email = leToken(String(form.get("t") ?? ""), segredo);
  if (!email) return volta("expirado");

  const headers = { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" };
  const criado = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers,
    body: JSON.stringify({ email, unsubscribed: false, segments: [{ id: segmento }] }),
  });
  if (!criado.ok) {
    // quem já estava na base (e talvez tenha saído) volta pela confirmação nova
    const alvo = `https://api.resend.com/contacts/${encodeURIComponent(email)}`;
    const atualizado = await fetch(alvo, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ unsubscribed: false }),
    });
    const noSegmento = await fetch(`${alvo}/segments/${segmento}`, { method: "POST", headers });
    if (!atualizado.ok || !noSegmento.ok) {
      console.error("resend", criado.status, atualizado.status, noSegmento.status);
      return volta("erro");
    }
  }
  return volta("ok");
}
