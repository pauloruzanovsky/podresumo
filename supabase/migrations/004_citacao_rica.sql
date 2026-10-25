-- Campos extraídos na mesma leitura da transcrição.
--
-- Por que agora: a entrada (a transcrição) é ~85% do custo da chamada e é
-- fixa. Pedir mais campos custa alguns tokens de saída; pedir depois custa
-- reler os 66 episódios inteiros de novo. Então tudo que queremos saber sobre
-- essas citações sai nesta passada.

-- A frase que a pessoa realmente falou, copiada da transcrição. O `contexto`
-- continua sendo a paráfrase do Claude; este é o texto literal.
ALTER TABLE episode_livros ADD COLUMN IF NOT EXISTS citacao_literal TEXT;

-- Quem citou (host ou convidado). Hoje isso vive solto dentro da prosa do
-- contexto ("Bruno menciona..."); como campo, permite filtrar por pessoa.
ALTER TABLE episode_livros ADD COLUMN IF NOT EXISTS quem_citou TEXT;

-- 'recomenda' | 'menciona' | 'critica'. Separa o livro que foi de fato
-- recomendado do que só apareceu de passagem.
ALTER TABLE episode_livros ADD COLUMN IF NOT EXISTS natureza TEXT;

-- `livros.temas` já existe (migração 002), mas vinha das tags do EPISÓDIO,
-- o que marcava "A Lógica do Cisne Negro" como Bitcoin e Produtividade.
-- Passa a ser preenchido pela extração, descrevendo o livro.
-- Nada a alterar aqui — fica o registro da mudança de significado.
