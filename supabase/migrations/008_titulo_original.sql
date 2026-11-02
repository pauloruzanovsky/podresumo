-- Título original (em inglês) do livro, mostrado pequeno embaixo do título.
--
-- O site é em português: livro com edição brasileira aparece com o título
-- dela ("Como Mudar Sua Mente"), e o original fica embaixo ("How to Change
-- Your Mind"), pra quem conhece o livro pelo nome de fora. Preenchido por
-- `flows.titulos_alt`; NULL quando não há título em inglês ou é o mesmo.

ALTER TABLE livros ADD COLUMN IF NOT EXISTS titulo_original TEXT;
