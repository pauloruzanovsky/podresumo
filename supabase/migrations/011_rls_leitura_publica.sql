-- Liga o Row-Level Security nas quatro tabelas públicas (alerta do Supabase
-- de 08/11/2026: "rls_disabled_in_public"). Sem RLS, quem tem a chave anon
-- (ela é pública: NEXT_PUBLIC_SUPABASE_ANON_KEY) podia ler, alterar e apagar.
--
-- Quem usa o quê:
--   - o site (web/scripts/retrato.mjs, no build) só LÊ, com a chave anon;
--   - o pipeline e os GitHub Actions escrevem com a service_role, que ignora o
--     RLS e continua funcionando igual.
-- Então: leitura liberada pra todos, escrita só pela service_role (nenhuma
-- política de insert/update/delete).
--
-- Pode rodar mais de uma vez.

alter table public.podcasts       enable row level security;
alter table public.episodes       enable row level security;
alter table public.livros         enable row level security;
alter table public.episode_livros enable row level security;

drop policy if exists "leitura publica" on public.podcasts;
drop policy if exists "leitura publica" on public.episodes;
drop policy if exists "leitura publica" on public.livros;
drop policy if exists "leitura publica" on public.episode_livros;

create policy "leitura publica" on public.podcasts       for select to anon, authenticated using (true);
create policy "leitura publica" on public.episodes       for select to anon, authenticated using (true);
create policy "leitura publica" on public.livros         for select to anon, authenticated using (true);
create policy "leitura publica" on public.episode_livros for select to anon, authenticated using (true);
