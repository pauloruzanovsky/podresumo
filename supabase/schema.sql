-- ============================
-- PodResumo — Schema
-- ============================

-- Podcasts cadastrados
CREATE TABLE podcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  youtube_channel_id TEXT NOT NULL UNIQUE,
  thumbnail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Episódios processados
CREATE TABLE episodes (
  id TEXT PRIMARY KEY,                -- YouTube video ID
  podcast_id UUID REFERENCES podcasts(id),
  ep_number TEXT,                     -- número do episódio (ex: "296"), extraído do título
  titulo TEXT NOT NULL,
  data DATE,
  duracao TEXT,
  thumbnail TEXT,
  convidados TEXT[],                  -- array nativo do PostgreSQL
  tags TEXT[],
  resumo TEXT,
  main_insight TEXT,
  main_action TEXT,
  topicos TEXT[],
  capitulos JSONB DEFAULT '[]',       -- [{titulo, timestamp_seg}] índice do episódio
  frases JSONB DEFAULT '[]',          -- [{texto, quem, timestamp_seg}] falas marcantes
  convidados_info JSONB DEFAULT '[]', -- [{nome, descricao}] na ordem de convidados
  extrator TEXT,                      -- "<modelo>/<versão do prompt>"; NULL = anterior ao tracking
  extraido_em TIMESTAMPTZ,            -- quando a extração foi feita
  link_youtube TEXT,
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Livros (tabela separada, normalizada)
CREATE TABLE livros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  autor TEXT,                         -- NULL quando o episódio não disse o autor
  tipo TEXT NOT NULL DEFAULT 'livro', -- 'livro' | 'outro' (filme, doc, série)
  titulo_alt TEXT[],                  -- títulos absorvidos em merges (outro idioma, subtítulo)
  temas TEXT[],                       -- temas DO LIVRO, vindos da extração
  UNIQUE(titulo, autor)
);

-- Relação N:N entre episódios e livros
CREATE TABLE episode_livros (
  episode_id TEXT REFERENCES episodes(id),
  livro_id UUID REFERENCES livros(id),
  contexto TEXT,                      -- por que o livro foi citado neste episódio (paráfrase)
  citacao_literal TEXT,               -- a frase dita, copiada da transcrição
  quem_citou TEXT,                    -- host ou convidado que mencionou
  natureza TEXT,                      -- 'recomenda' | 'menciona' | 'critica'
  timestamp_seg INTEGER,              -- momento da citação no vídeo (segundos)
  PRIMARY KEY (episode_id, livro_id)
);
