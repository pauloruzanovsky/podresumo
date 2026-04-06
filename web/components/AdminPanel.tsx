"use client";

import { useState } from "react";

const PRESETS = [
  {
    nome: "Os Sócios Podcast",
    playlist_id: "PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf",
    podcast_id: "a1b2c3d4-0000-0000-0000-000000000001",
  },
];

export default function AdminPanel() {
  const [playlistId, setPlaylistId] = useState("");
  const [podcastId, setPodcastId] = useState("");
  const [maxResults, setMaxResults] = useState(3);
  const [loading, setLoading] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  const handleSync = async () => {
    setLoading(true);
    setOutput("");
    setError("");

    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlist_id: playlistId,
          podcast_id: podcastId,
          max_results: maxResults,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error + (data.details ? `\n${data.details}` : ""));
      } else {
        setOutput(data.output);
      }
    } catch (err) {
      setError("Erro de conexão com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    setPlaylistId(preset.playlist_id);
    setPodcastId(preset.podcast_id);
  };

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Admin</h1>
        <p className="text-muted text-sm">
          Sincronize episódios de podcasts via pipeline ETL.
        </p>
      </div>

      {/* Presets */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-accent uppercase tracking-widest mb-3">
          Podcasts Cadastrados
        </h2>
        <div className="flex gap-3 flex-wrap">
          {PRESETS.map((preset) => (
            <button
              key={preset.podcast_id}
              onClick={() => applyPreset(preset)}
              className="px-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground hover:border-accent/30 transition-colors"
            >
              {preset.nome}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6">
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">
              Playlist ID
            </label>
            <input
              type="text"
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              placeholder="PLczDDIRnclWRAi9rLUxxUHz2j7XSEothf"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-accent/40 transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">
              Podcast ID (UUID no Supabase)
            </label>
            <input
              type="text"
              value={podcastId}
              onChange={(e) => setPodcastId(e.target.value)}
              placeholder="a1b2c3d4-0000-0000-0000-000000000001"
              className="w-full px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-accent/40 transition-colors font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-muted mb-1.5 font-medium">
              Episódios a processar
            </label>
            <input
              type="number"
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              min={1}
              max={10}
              className="w-24 px-4 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-accent/40 transition-colors"
            />
          </div>
          <button
            onClick={handleSync}
            disabled={loading || !playlistId || !podcastId}
            className="self-start px-6 py-2.5 bg-accent text-background font-semibold text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "⏳ Processando..." : "🚀 Sincronizar"}
          </button>
        </div>
      </div>

      {/* Output */}
      {loading && (
        <div className="bg-card border border-accent/20 rounded-2xl p-6 mb-6">
          <p className="text-sm text-accent animate-pulse">
            Pipeline em execução... Isso pode levar alguns minutos.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6 mb-6">
          <h3 className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-2">
            Erro
          </h3>
          <pre className="text-sm text-red-300 whitespace-pre-wrap font-mono">
            {error}
          </pre>
        </div>
      )}

      {output && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-widest mb-3">
            Output do Pipeline
          </h3>
          <pre className="text-xs text-muted whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
            {output}
          </pre>
        </div>
      )}
    </div>
  );
}
