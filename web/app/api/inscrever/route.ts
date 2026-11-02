import { NextResponse } from "next/server";
import { criaToken } from "@/lib/confirmacao";
import { SITE_URL } from "@/lib/site";

/**
 * Inscrição na newsletter semanal. O formulário do site posta aqui e daqui
 * sai o e-mail de confirmação (dupla confirmação, exigida pela LGPD). O
 * endereço só entra na lista do Resend em /api/confirmar, depois do clique.
 * A chave da API fica só no servidor.
 *
 * Configurar: RESEND_API_KEY e NEWSLETTER_SEGREDO no .env.local e na Vercel.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REMETENTE = "Podlibris <livros@newsletter.podlibris.com>";

export async function POST(req: Request) {
  const chave = process.env.RESEND_API_KEY;
  const segredo = process.env.NEWSLETTER_SEGREDO;
  if (!chave || !segredo) {
    return NextResponse.json(
      { ok: false, erro: "A newsletter ainda não está configurada." },
      { status: 503 }
    );
  }

  let dados: { email?: string; site?: string };
  try {
    dados = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  // `site` é um campo escondido: humano não preenche, robô sim.
  if (dados.site) return NextResponse.json({ ok: true });

  const email = (dados.email ?? "").trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, erro: "Esse e-mail não parece válido." }, { status: 400 });
  }

  const link = `${SITE_URL}/confirmar?t=${criaToken(email, segredo)}`;
  const resposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: REMETENTE,
      to: [email],
      subject: "Confirme sua inscrição no Podlibris",
      text: `Falta um clique pra receber os livros citados nos podcasts, toda semana:\n\n${link}\n\nSe não foi você, ignore este e-mail: sem o clique, nada acontece.`,
      html: `<div style="background:#ffffff;padding:32px 24px;font-family:Georgia,serif;color:#2b2521;"><p style="font-size:21px;font-weight:bold;color:#0f2e24;margin:0 0 16px;">Podlibris</p><p style="font-size:17px;line-height:1.5;margin:0 0 22px;">Falta um clique pra receber os livros citados nos podcasts, toda semana.</p><p style="margin:0 0 22px;"><a href="${link}" style="background:#0f2e24;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;">Confirmar inscrição</a></p><p style="font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6b6155;margin:0;">Se não foi você, ignore este e-mail: sem o clique, nada acontece.</p></div>`,
    }),
  });

  if (!resposta.ok) {
    console.error("resend", resposta.status, (await resposta.text()).slice(0, 300));
    return NextResponse.json(
      { ok: false, erro: "Não deu pra inscrever agora. Tente de novo em instantes." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
