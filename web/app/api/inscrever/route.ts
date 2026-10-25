import { NextResponse } from "next/server";

/**
 * Inscrição na newsletter semanal. O formulário do site posta aqui e daqui o
 * e-mail vai pro Buttondown, que guarda a lista, manda o e-mail de
 * confirmação (dupla confirmação, exigida pela LGPD) e cuida do
 * descadastro. A chave da API fica só no servidor.
 *
 * Configurar: BUTTONDOWN_API_KEY no .env.local e na Vercel.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(req: Request) {
  const chave = process.env.BUTTONDOWN_API_KEY;
  if (!chave) {
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const resposta = await fetch("https://api.buttondown.com/v1/subscribers", {
    method: "POST",
    headers: {
      Authorization: `Token ${chave}`,
      "Content-Type": "application/json",
      // e-mail já inscrito: em vez de erro, reenvia a confirmação se ainda
      // não confirmou (e reinscreve quem tinha saído)
      "X-Buttondown-Collision-Behavior": "add",
    },
    body: JSON.stringify({
      email_address: email,
      // "unactivated" = recebe o e-mail de confirmação antes de entrar
      type: "unactivated",
      ...(ip ? { ip_address: ip } : {}),
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    console.error("buttondown", resposta.status, corpo.slice(0, 300));
    const jaSaiu = corpo.includes("subscriber_suppressed");
    return NextResponse.json(
      {
        ok: false,
        erro: jaSaiu
          ? "Esse e-mail se descadastrou antes. Fale com a gente pra voltar."
          : "Não deu pra inscrever agora. Tente de novo em instantes.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
