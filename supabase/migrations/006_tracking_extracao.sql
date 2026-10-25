-- Com qual extrator cada episódio foi processado, e quando.
--
-- Sem isto, depois que o prompt muda não há como listar quais episódios
-- ficaram com a versão antiga: `status = 'done'` só diz que foi processado
-- alguma vez. Com o acervo indo de 66 pra 200+ em levas, a pergunta "quais
-- faltam refazer?" precisa virar um filtro.

-- "<modelo>/<versão do prompt>", ex.: "claude-opus-5/v3". A versão é a
-- constante VERSAO_PROMPT em pipeline/transform/claude.py. NULL = extração
-- anterior ao tracking (Haiku, transcrição cortada em 150 mil caracteres).
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS extrator TEXT;

-- Quando a extração foi feita (não quando foi gravada no banco).
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS extraido_em TIMESTAMPTZ;
