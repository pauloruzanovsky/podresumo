-- A coluna `temas` estava no schema.sql mas nunca foi aplicada ao banco:
-- flows/backfill_temas.py falha com PGRST204 sem ela.
--
-- Guarda os temas do livro, derivados das tags dos episódios que o citam.

ALTER TABLE livros ADD COLUMN IF NOT EXISTS temas TEXT[];
