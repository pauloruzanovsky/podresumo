-- Mais três campos extraídos na mesma leitura da transcrição (ver 004 pro
-- raciocínio de custo: a entrada é fixa, a saída extra custa centavos).
--
-- JSONB em vez de tabelas: são listas curtas que só existem dentro do
-- episódio e são lidas inteiras pela página dele. Nada aqui é filtrado ou
-- cruzado entre episódios — se um dia for, vira tabela.

-- [{ "titulo": "...", "timestamp_seg": 786 }] em ordem cronológica.
-- Vira o índice clicável do episódio.
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS capitulos JSONB DEFAULT '[]'::jsonb;

-- [{ "texto": "...", "quem": "...", "timestamp_seg": 786 }]
-- Falas marcantes, independentes de livro. Dá conteúdo a episódio que não
-- cita obra nenhuma.
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS frases JSONB DEFAULT '[]'::jsonb;

-- [{ "nome": "...", "descricao": "..." }] — mesma ordem de `convidados`.
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS convidados_info JSONB DEFAULT '[]'::jsonb;
