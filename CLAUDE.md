# Podlibris

Site com os livros citados nos podcasts, com a fala de quem citou e o minuto
exato no YouTube: **podlibris.com**. O carro-chefe é o **Os Sócios Podcast**
(Bruno e Malu Perini), com estantes menores de Modern Wisdom, The Tim Ferriss
Show e Huberman Lab. A pasta e o repositório ainda se chamam `podresumo`, o
nome antigo; não renomear (rotinas e caminhos dependem dele).

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
   Sem API: `--exportar --novos` grava os prompts em `respostas/assinatura/`,
   o Claude da assinatura escreve `<id>.json` ao lado e `--do-assinatura`
   valida no schema e grava (inválido fica `pending`).
4. `normalize_livros` — funde livros duplicados. **Rodar sem `--apply`, ler o
   plano, só então aplicar**: já propôs fusão errada de homônimos
   (`TITULOS_HOMONIMOS`, `ALIASES` no arquivo).
5. `backfill_capas` — capas via Open Library e Google Books;
   `capas_manuais.json` sobrepõe.
6. `preencher_slugs` — gera os endereços `/livro/<slug>` e `/episodio/<slug>`
   uma vez só; slug nunca é reescrito.
7. `newsletter` — monta o e-mail da semana (episódios **lançados** de segunda a
   domingo da semana passada) e deixa como **rascunho** no Resend (broadcast).
   Nunca envia sozinho: o rascunho aparece no chat com um botão de aprovar, e
   só depois do clique do Paulo `--enviar <id>` manda pra lista. `--fala
   slug1,slug2` escolhe a fala de abertura e os livros seguintes; `--teste
   <email>` manda só pra um endereço. Envio previsto: terça de manhã.
8. `capas_podcasts` — arte de cada podcast, da busca da Apple Podcasts. Rodar
   uma vez ao cadastrar podcast novo.
9. `normalize_pessoas` — unifica grafias de convidado, autor e quem citou. A
   lista é à mão (`ALIASES`) e roda sozinha na coleta do lote.
10. `titulos_alt` — título PT e EN de cada livro em `titulo_alt` (pago, Batch;
    a busca do site usa). `--duplicatas` lista pares PT/EN do mesmo autor, que
    viram linhas de `ALIASES` em `normalize_livros`. Livro novo: `--enviar --novos`.
11. `pendencias` — relatório do que precisa de decisão humana. Só lê. A rotina
    de segunda publica na página privada:
    https://claude.ai/artifact/5Rq8ymcDLy5a8gAk5FMyf1

## Regras que o Paulo pediu

- **Gasto com API:** antes de qualquer gasto, piloto pequeno, estimativa
  medida com count_tokens e ok explícito dele. Exceção: o lote semanal
  automático até **R$ 10**. Backfill de episódios antigos ou outro podcast
  precisam de ok. Reportar o custo real depois. Cancelar lote não garante
  custo zero.
- **Sempre o modelo mais novo:** o modelo e o preço ficam em
  `MODELO_PADRAO` e `PRECOS` (`transform/claude.py`). `confere_modelo()` para
  qualquer gasto se houver modelo mais novo da mesma família na API de modelos
  (o lote de out/2026 rodou no Opus 5 com o 5.5 no ar, mais barato: ~R$ 75 a
  mais). Antes de propor gasto, conferir a lista de modelos e os preços.
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
  grátis pausa por inatividade) e baixa uma leva de transcrições dos 4
  podcasts. Dos em inglês, só episódio a partir de 02/11/2026, com 45 min ou
  mais e sem "Essentials" (`--desde`, `--min-minutos`, `--excluir`). Não gasta API.
- `podlibris-lote-semanal` — domingo 21h: extrai os episódios novos dos 4
  podcasts na assinatura (um subagente Opus por episódio; teste de 03/11
  empatou com a API). O que falhar vai pro lote da API, os mais recentes que
  cabem em R$ 10 no pior caso (`--ate-caber`); o resto espera a semana
  seguinte. Episódio longo ≈ R$ 1 no pior caso.
- `podlibris-newsletter-semanal` — segunda 9h: coleta o lote (a coleta já
  preenche os slugs), grava os títulos PT/EN da semana anterior e envia os dos
  livros novos (`titulos_alt`, só se a estimativa for até US$ 1), busca capas e
  cria o rascunho da newsletter.
- GitHub Actions `manter-banco-ativo.yml` — acesso diário ao Supabase, de
  reserva.
- GitHub Actions `aquecer-cache.yml` — quando a Vercel termina um deploy,
  visita a home e tudo que ela linka (~80 páginas), porque deploy zera o
  cache e a primeira visita a um livro levava de 1,5 a 6 s.

## Site (web)

- Cores e tema: tokens em `web/app/globals.css` (`--tema-*`), claro e escuro
  pelo atributo `data-theme` no `<html>`; o script em
  `components/TrocaTema.tsx` decide antes de pintar. Use sempre as classes de
  tema (`bg-background`, `text-foreground`, `bg-accent`, `text-on-accent`…),
  nunca cor fixa, ou o tema escuro quebra.
- Ícone: `components/Logo.tsx` (mesmas medidas de `brand/gera_marca.py`).
  Favicon em `app/icon.svg`, ícone de celular em `app/apple-icon.tsx`, cartões
  de compartilhamento em `lib/og.tsx`.
- Podcasts escondidos, em inglês (fora do baralho da home) e apresentadores
  (fora dos rankings): `lib/podcasts.ts`.
- Podcast estrangeiro: `extract/transcript.py` pede o idioma original, porque a
  faixa "pt" do YouTube é tradução de máquina e a fala não seria literal.
  `reprocessar_batch` grava direto: podcast novo aparece no site na hora.
- **O site não lê o banco.** `web/scripts/retrato.mjs` roda antes do build
  (`npm run build`/`npm run dev`) e grava `web/retrato/dados.json` (gitignored,
  ~12 MB, sem transcrições); `lib/dados.ts` responde às mesmas consultas do
  supabase-js em memória, então as páginas só importam de `@/lib/dados`.
  Consulta nova que use filtro ou relação fora do que `lib/dados.ts` cobre
  lança erro: estender lá. Motivo: em 08/11/2026 o Supabase grátis (0,5 GB)
  travou por swap e Disk IO e derrubava as páginas fora do cache. Banco fora
  do ar no build da Vercel faz o build falhar e a versão no ar continua.
- Dado novo entra com deploy novo: `flows.atualizar_site` chama o deploy hook
  (`VERCEL_DEPLOY_HOOK` no `pipeline/.env`), no máximo 1 vez a cada 6 h, no fim
  da coleta, de `backfill_capas`, `descricoes` e `normalize_livros --apply`; o
  GitHub Actions `deploy-diario.yml` (mesmo hook como secret) pega o resto.
- Páginas e cartões usam `revalidate = false`: montados na primeira visita e
  guardados até o próximo deploy (os dados só mudam com deploy). Com 60 s e
  depois 1 dia, os robôs estouraram a cota grátis da Vercel em nov/2026 (695
  mil ISR writes de 200 mil, 4h06 de CPU de 4h). Não pôr prazo de volta, e
  não multiplicar deploys: cada um zera o cache.
  Endereço antigo por id redireciona pro slug.
- Newsletter: inscrição em `/api/inscrever` manda o link assinado
  (`lib/confirmacao.ts`); o contato só entra no segmento do Resend pelo botão de
  `/confirmar`. Precisa de `RESEND_API_KEY`, `RESEND_SEGMENT_ID` e
  `NEWSLETTER_SEGREDO`.
- Afiliado Amazon: `NEXT_PUBLIC_AMAZON_TAG` na Vercel (`AMAZON_TAG` no
  pipeline, pra newsletter).
- O dev server às vezes serve CSS velho: parar, apagar `web/.next/dev` e subir
  de novo.
