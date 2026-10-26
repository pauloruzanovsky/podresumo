# Podlibris

Site com os livros citados nos podcasts, com a fala de quem citou e o minuto
exato no YouTube: **podlibris.com**. Hoje só o **Os Sócios Podcast** (Bruno e
Malu Perini). A pasta e o repositório ainda se chamam `podresumo`, o nome
antigo; não renomear (rotinas e caminhos dependem dele).

**Objetivo:** chamar a atenção do Bruno Perini e ganhar algum dinheiro com
afiliado da Amazon. A pergunta de produto é "o Perini abriria esse link no
celular e ficaria impressionado?", não completude técnica. O diferencial é a
citação com o minuto; o link viaja por WhatsApp, então Open Graph e celular
importam.

Fale com o Paulo em **português do Brasil**.

## Estrutura

- `web/` — site em Next.js 16 (App Router, Turbopack), Tailwind v4. Deploy na
  Vercel: **push no `master` vai direto pra produção**.
- `pipeline/` — Python (venv em `pipeline/.venv`): baixa transcrições do
  YouTube, extrai livros e citações com a API da Anthropic (Batch, Opus) e
  grava no Supabase. Rodar os módulos de dentro de `pipeline/`:
  `.venv/Scripts/python.exe -m flows.<nome>`.
- `supabase/` — schema e migrações (o Paulo roda as migrações no painel).
- `brand/` — identidade visual: SVGs do ícone, paleta, `gera_marca.py`.
  Guia da marca: https://claude.ai/artifact/4u5wMLfnsJDpq7DDfaRhBk
- `rodar-app.bat` — sobe o site local e abre o navegador.

Segredos ficam em `pipeline/.env` e `web/.env.local` (gitignored). Nunca
comitar chave.

## Fluxo de dados (pipeline/flows)

1. `catalogar_episodios` — cadastra a playlist inteira como `listed`.
2. `baixar_transcricoes` — baixa transcrições e marca `pending`. O YouTube
   bloqueia o IP depois de ~15 downloads (dura 2–15h); por isso roda em levas
   pequenas. O #264 não tem legenda (pulado de propósito).
3. `reprocessar_batch` — extração paga. `--estimar` mede com count_tokens
   (grátis); `--enviar --novos` manda os `pending`; `--teto-brl` só envia se o
   pior caso couber; `--coletar ultimo` grava o resultado (`done`).
4. `normalize_livros` — funde livros duplicados. **Rodar sem `--apply`, ler o
   plano, só então aplicar**: já propôs fusão errada de homônimos
   (`TITULOS_HOMONIMOS`, `ALIASES` no arquivo).
5. `backfill_capas` — capas via Open Library e Google Books;
   `capas_manuais.json` sobrepõe.
6. `preencher_slugs` — gera os endereços `/livro/<slug>` e `/episodio/<slug>`
   uma vez só; slug nunca é reescrito.
7. `newsletter` — monta o e-mail da semana e deixa como **rascunho** no
   Buttondown. Nunca envia sozinho: o Paulo revisa e envia.

## Regras que o Paulo pediu

- **Gasto com API:** antes de qualquer gasto, piloto pequeno, estimativa
  medida com count_tokens e ok explícito dele. Exceção: o lote semanal
  automático até **R$ 10**. Backfill de episódios antigos ou outro podcast
  precisam de ok. Reportar o custo real depois. Cancelar lote não garante
  custo zero.
- **Resposta paga vai pro disco antes do banco:** `pipeline/respostas/<id>.json`
  (gitignored), e `--do-cache` regrava a partir dele. Nunca pagar duas vezes.
- **Nunca rodar `backfill_temas`.**
- *1984*, *Fahrenheit 451*, *A Odisseia* e *O Senhor dos Anéis* estão como
  tipo `outro` de propósito (eram referências a filme). Ler a citação antes de
  mudar o tipo de um livro.
- **Commit e push só quando ele pedir.** Antes de push, `npx next build` em
  `web/` tem que passar.
- Enviar e-mail ou mensagem em nome dele só com confirmação.

## Rotinas agendadas (app do Claude)

- `podresumo-baixar-transcricoes` — 8h e 20h: mantém o Supabase ativo (o plano
  grátis pausa por inatividade) e baixa uma leva de transcrições. Não gasta API.
- `podlibris-lote-semanal` — domingo 21h: envia os episódios novos se o pior
  caso couber em R$ 10.
- `podlibris-newsletter-semanal` — segunda 9h: coleta o lote (a coleta já
  preenche os slugs), busca capas e cria o rascunho da newsletter.
- GitHub Actions `manter-banco-ativo.yml` — acesso diário ao Supabase, de
  reserva.

## Site (web)

- Cores e tema: tokens em `web/app/globals.css` (`--tema-*`), claro e escuro
  pelo atributo `data-theme` no `<html>`; o script em
  `components/TrocaTema.tsx` decide antes de pintar. Use sempre as classes de
  tema (`bg-background`, `text-foreground`, `bg-accent`, `text-on-accent`…),
  nunca cor fixa, ou o tema escuro quebra.
- Ícone: `components/Logo.tsx` (mesmas medidas de `brand/gera_marca.py`).
  Favicon em `app/icon.svg`, ícone de celular em `app/apple-icon.tsx`, cartões
  de compartilhamento em `lib/og.tsx`.
- Podcasts escondidos e apresentadores (ficam fora dos rankings):
  `lib/podcasts.ts`. Modern Wisdom está escondido, não apagado.
- Páginas usam ISR (`revalidate = 60`). Endereço antigo por id redireciona
  pro slug.
- Afiliado Amazon: `NEXT_PUBLIC_AMAZON_TAG` na Vercel (`AMAZON_TAG` no
  pipeline, pra newsletter).
- O dev server às vezes serve CSS velho: parar, apagar `web/.next/dev` e subir
  de novo.
