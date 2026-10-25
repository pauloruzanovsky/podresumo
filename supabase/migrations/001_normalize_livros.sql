-- Colunas usadas por flows/normalize_livros.py
--
-- tipo:       separa livro de filme/documentário/série que o extrator capturou
--             junto. A biblioteca do site filtra por tipo = 'livro'.
-- titulo_alt: títulos alternativos absorvidos num merge (edição em outro
--             idioma, subtítulo, erro de transcrição). Serve pra busca e pra
--             não perder o rastro do que foi fundido.

ALTER TABLE livros ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'livro';
ALTER TABLE livros ADD COLUMN IF NOT EXISTS titulo_alt TEXT[];

-- O autor deixa de ser obrigatório: melhor NULL do que a string
-- "Não especificado" vazando pra UI.
ALTER TABLE livros ALTER COLUMN autor DROP NOT NULL;
