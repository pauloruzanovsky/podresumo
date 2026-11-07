-- Índice das citações por livro.
--
-- A chave de episode_livros é (episode_id, livro_id): serve pra "livros do
-- episódio", não pra "citações do livro". Toda consulta que parte do livro
-- (home, estantes, página do livro) lia a tabela inteira do disco, uma vez
-- por livro. Em 07/11/2026 isso esgotou a cota de Disk IO do plano grátis e
-- as consultas da home e de /episodios passaram dos 3 s do Supabase
-- ("canceling statement due to statement timeout").
CREATE INDEX IF NOT EXISTS episode_livros_livro_id_idx ON episode_livros (livro_id);

-- A home e /episodios filtram episódio por status.
CREATE INDEX IF NOT EXISTS episodes_status_idx ON episodes (status);
