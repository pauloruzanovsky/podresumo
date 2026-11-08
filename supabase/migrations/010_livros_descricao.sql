-- Descrição curta do livro (2 ou 3 frases, em português), mostrada na página
-- dele embaixo das citações.
--
-- Texto próprio, não a sinopse da editora: a sinopse do Google Books serve só
-- de base pra quem escreve (o Claude da assinatura, via `flows.descricoes`).
-- Assim o livro citado no podcast em inglês também ganha texto em português,
-- e o site não repete o mesmo parágrafo de mil outras lojas.
-- NULL quando não há base confiável pra descrever o livro.

ALTER TABLE livros ADD COLUMN IF NOT EXISTS descricao TEXT;
