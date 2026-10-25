-- Endereço legível pra livro e episódio:
--   /livro/em-nome-do-povo   em vez de   /livro/37c686c2-4a77-...
--   /episodio/312-o-que-a-escola-nao-ensina-sobre-a-historia-do-brasil
--
-- Guardado em coluna (e não calculado a cada visita) porque o endereço não
-- pode mudar depois de publicado: se a limpeza de duplicados corrigir um
-- título, o link que já circula no WhatsApp e no Google continua valendo.
-- O pipeline preenche uma vez e nunca reescreve um slug existente.
--
-- Os links antigos (com o id) continuam funcionando: o site redireciona pro
-- endereço novo.

ALTER TABLE livros ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE episodes ADD COLUMN IF NOT EXISTS slug TEXT;

-- Únicos, mas aceitando NULL enquanto o preenchimento não roda.
CREATE UNIQUE INDEX IF NOT EXISTS livros_slug_key ON livros (slug);
CREATE UNIQUE INDEX IF NOT EXISTS episodes_slug_key ON episodes (slug);
