import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Confirmar inscrição",
  robots: { index: false },
};

const MENSAGENS: Record<string, { titulo: string; texto: string }> = {
  ok: {
    titulo: "Inscrição confirmada.",
    texto: "Na próxima edição, os livros da semana chegam no seu e-mail.",
  },
  expirado: {
    titulo: "Esse link expirou.",
    texto: "Inscreva-se de novo no site pra receber um link novo.",
  },
  erro: {
    titulo: "Não deu pra confirmar agora.",
    texto: "Tente de novo em instantes pelo link do e-mail.",
  },
};

export default async function ConfirmarPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; estado?: string }>;
}) {
  const { t, estado } = await searchParams;
  const mensagem = estado ? (MENSAGENS[estado] ?? MENSAGENS.erro) : null;

  return (
    <main className="max-w-md mx-auto px-4 py-16 text-center">
      {mensagem ? (
        <>
          <h1 className="font-serif text-2xl font-semibold">{mensagem.titulo}</h1>
          <p className="text-muted mt-2">{mensagem.texto}</p>
          <Link href="/" className="inline-block mt-6 text-sm underline">
            Voltar pro site
          </Link>
        </>
      ) : (
        <>
          <h1 className="font-serif text-2xl font-semibold">Falta um clique.</h1>
          <p className="text-muted mt-2">Confirme pra receber os livros da semana no seu e-mail.</p>
          {/* botão em vez de confirmar ao abrir: ver /api/confirmar */}
          <form action="/api/confirmar" method="post" className="mt-6">
            <input type="hidden" name="t" value={t ?? ""} />
            <button
              type="submit"
              className="px-5 py-2.5 text-sm bg-accent hover:bg-accent-hover text-on-accent font-semibold rounded-full transition-colors"
            >
              Confirmar inscrição
            </button>
          </form>
        </>
      )}
    </main>
  );
}
