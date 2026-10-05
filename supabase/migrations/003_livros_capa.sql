-- URL da capa no Open Library, preenchida por flows/backfill_capas.py.
--
-- Guardar em vez de buscar em tempo de render: são ~157 livros por página da
-- biblioteca, e uma chamada HTTP por livro a cada render inviabilizaria a
-- página. NULL é o caso normal — o Open Library não tem capa pra boa parte
-- dos títulos em português, e aí a capa gerada assume.

ALTER TABLE livros ADD COLUMN IF NOT EXISTS capa_url TEXT;
