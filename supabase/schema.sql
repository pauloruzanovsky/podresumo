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
  link_youtube TEXT,
  status TEXT DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Livros (tabela separada, normalizada)
CREATE TABLE livros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  autor TEXT NOT NULL,
  UNIQUE(titulo, autor)
);

-- Relação N:N entre episódios e livros
CREATE TABLE episode_livros (
  episode_id TEXT REFERENCES episodes(id),
  livro_id UUID REFERENCES livros(id),
  PRIMARY KEY (episode_id, livro_id)
);
