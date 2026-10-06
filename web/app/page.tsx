import { supabase } from "@/lib/supabase";
import Link from "next/link";
import BookCover from "@/components/BookCover";
import HomeSearch from "@/components/HomeSearch";
import { slugify } from "@/lib/slug";

export const revalidate = 60;

interface LivroCard {
  id: string;
  titulo: string;
  autor: string | null;
  citacoes: number;
  ultimaData: string | null;
  contexto: string | null;
  capaUrl: string | null;
}

export default async function Home() {
  const [livrosRes, podcastsRes, episodesRes] = await Promise.all([
    supabase
      .from("livros")
      .select(
        "id, titulo, autor, capa_url, episode_livros(episode_id, contexto, episodes(data, podcast_id))"
      )
      .eq("tipo", "livro"), // filme/documentário/série citados ficam de fora
    supabase.from("podcasts").select("id, nome", { count: "exact" }),
    supabase
      .from("episodes")
      .select("*", { count: "exact", head: true })
      .eq("status", "done"),
  ]);

  if (livrosRes.error) {
    return (
      <p className="text-red-600">
        Erro ao carregar livros: {livrosRes.error.message}
      </p>
    );
  }

  const livros: LivroCard[] = ((livrosRes.data ?? []) as any[])
    .map((livro: any) => {
      const rels: any[] = livro.episode_livros ?? [];
      const datas = rels
        .map((r) => r.episodes?.data)
        .filter((d: unknown): d is string => typeof d === "string");
      const ultimaData =
        datas.length > 0
          ? datas.reduce((a, b) => (a > b ? a : b))
          : null;
      // O contexto da citação mais recente — é ele que dá motivo pra clicar.
      const contexto =
        [...rels]
          .sort((a, b) => ((b.episodes?.data ?? "") > (a.episodes?.data ?? "") ? 1 : -1))
          .map((r) => r.contexto)
          .find((c: unknown): c is string => typeof c === "string" && c.length > 0) ??
        null;

      return {
        id: livro.id,
        titulo: livro.titulo,
        autor: livro.autor,
        citacoes: rels.length,
        ultimaData,
        contexto,
        capaUrl: livro.capa_url ?? null,
      };
    })
    .filter((l) => l.citacoes > 0);

  const maisCitados = [...livros]
    .sort((a, b) => b.citacoes - a.citacoes || a.titulo.localeCompare(b.titulo))
    .slice(0, 8);

  const citadosRecentes = [...livros]
    .filter((l) => l.ultimaData)
    .sort((a, b) => (b.ultimaData! > a.ultimaData! ? 1 : -1))
    .slice(0, 8);

  const totalLivros = livros.length;
  const totalEpisodes = episodesRes.count ?? 0;
  const totalPodcasts = podcastsRes.count ?? 0;
  // Uma estante por podcast: quantos livros ela tem e as capas dos mais
  // citados ali, pra prateleira já mostrar o que tem dentro.
  const estantes = ((podcastsRes.data ?? []) as any[])
    .map((p) => {
      const daqui = ((livrosRes.data ?? []) as any[])
        .map((livro) => ({
          id: livro.id as string,
          titulo: livro.titulo as string,
          autor: livro.autor as string | null,
          capaUrl: (livro.capa_url ?? null) as string | null,
          vezes: ((livro.episode_livros ?? []) as any[]).filter(
            (r) => r.episodes?.podcast_id === p.id
          ).length,
        }))
        .filter((l) => l.vezes > 0)
        // capa real primeiro: prateleira de monogramas não convida ninguém
        .sort(
          (a, b) =>
            Number(Boolean(b.capaUrl)) - Number(Boolean(a.capaUrl)) ||
            b.vezes - a.vezes
        );
      return {
        nome: p.nome as string,
        slug: slugify(p.nome),
        total: daqui.length,
        capas: daqui.slice(0, 6),
      };
    })
    .filter((e) => e.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <div>
      {/* Hero + Busca — compacto no celular pelo mesmo motivo da biblioteca:
          os cards precisam começar dentro da primeira tela. */}
      <div className="text-center mb-8 sm:mb-16">
        <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded-full bg-card border border-border mb-5">
          <span className="w-1.5 h-1.5 rounded-full bg-muted/50" />
          <span className="text-xs font-medium text-muted">
            {totalLivros} livros descobertos em podcasts
          </span>
        </div>
        <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight mb-3 sm:mb-5 leading-tight sm:leading-[1.08]">
          O que ler em seguida,{" "}
          <span className="italic text-muted sm:block">
            recomendado por quem você ouve.
          </span>
        </h1>
        <p className="hidden sm:block text-muted text-lg max-w-xl mx-auto leading-relaxed mb-8">
          Os livros citados nos podcasts, com a fala de quem indicou e o
          minuto exato pra ouvir.
        </p>

        <div className="mt-4 sm:mt-0">
          <HomeSearch />
        </div>

        {/* Celular: os três números numa linha de texto. Desktop: o bloco. */}
        <p className="sm:hidden text-xs text-muted mt-4">
          <span className="font-semibold text-foreground">{totalLivros}</span> livros
          {" · "}
          <span className="font-semibold text-foreground">{totalEpisodes}</span> episódios
          {" · "}
          <span className="font-semibold text-foreground">{totalPodcasts}</span>{" "}
          {totalPodcasts === 1 ? "podcast" : "podcasts"}
        </p>

        <div className="hidden sm:flex justify-center gap-8 mt-10">
          <Stat value={totalLivros} label="livros" />
          <div className="w-px bg-border" />
          <Stat value={totalEpisodes} label="episódios" />
          <div className="w-px bg-border" />
          <Stat value={totalPodcasts} label={totalPodcasts === 1 ? "podcast" : "podcasts"} />
        </div>
      </div>

      {/* Estantes — a porta de entrada: é por elas que se chega às páginas
          /podcast, que são o que cada programa tem motivo pra divulgar. */}
      {estantes.length > 0 && (
        <Section
          title="Estantes"
          subtitle="Os livros de cada podcast, na prateleira dele."
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {estantes.map((e) => (
              <Link
                key={e.slug}
                href={`/podcast/${e.slug}`}
                className="group block p-5 sm:p-6 bg-card border border-border rounded-2xl hover:bg-card-hover transition-colors"
              >
                {/* Livros de pé sobre a prateleira */}
                <div className="flex items-end gap-2 sm:gap-3 px-1">
                  {e.capas.map((l) => (
                    <BookCover
                      key={l.id}
                      titulo={l.titulo}
                      autor={l.autor}
                      capaUrl={l.capaUrl}
                      className="flex-1 min-w-0 max-w-[84px] shadow-md rounded-b-none"
                    />
                  ))}
                </div>
                <div className="h-2 rounded-sm bg-shelf shadow-[0_3px_6px_-2px_rgba(43,37,33,0.35)]" />

                <div className="mt-5 flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-widest text-muted">
                      A estante de
                    </span>
                    <span className="block font-serif text-2xl font-semibold leading-tight group-hover:underline">
                      {e.nome}
                    </span>
                  </div>
                  <span className="text-sm text-muted whitespace-nowrap">
                    {e.total} livros →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}

      {/* Mais citados */}
      <Section
        title="Mais citados"
        subtitle="Livros que aparecem em mais episódios — a recomendação que se repete."
      >
        <LivroGrid livros={maisCitados} mode="citacoes" />
      </Section>

      {/* Citados recentemente */}
      <Section
        title="Citados recentemente"
        subtitle="Livros que apareceram nos episódios mais novos."
      >
        <LivroGrid livros={citadosRecentes} mode="data" />
      </Section>

      {/* CTA biblioteca */}
      <div className="mt-16 text-center">
        <Link
          href="/biblioteca"
          className="inline-flex items-center gap-2 px-5 py-3 bg-card border border-border rounded-xl text-foreground text-sm font-semibold hover:bg-card-hover transition-colors"
        >
          Ver biblioteca completa
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted mt-0.5">{label}</div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <div className="mb-6">
        <h2 className="font-serif text-2xl font-semibold tracking-tight mb-1">{title}</h2>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function LivroGrid({
  livros,
  mode,
}: {
  livros: LivroCard[];
  mode: "citacoes" | "data";
}) {
  if (livros.length === 0) {
    return (
      <p className="text-sm text-muted/60 text-center py-8">
        Nenhum livro ainda.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {livros.map((livro) => (
        <Link
          key={livro.id}
          href={`/livro/${livro.id}`}
          className="group flex gap-4 xl:flex-col p-4 bg-card border border-border rounded-2xl hover:border-foreground/20 hover:bg-card-hover transition-all"
        >
          <BookCover
            titulo={livro.titulo}
            autor={livro.autor}
            capaUrl={livro.capaUrl}
            className="w-24 shrink-0 shadow-sm"
          />

          <div className="min-w-0 flex flex-col">
            <h3 className="text-sm font-semibold text-foreground group-hover:underline transition-colors leading-snug line-clamp-2">
              {livro.titulo}
            </h3>
            <p className="text-xs text-muted mt-0.5 line-clamp-1">
              {livro.autor ?? <span className="italic">autor não citado</span>}
            </p>

            {livro.contexto && (
              <p className="text-xs text-muted/90 leading-relaxed mt-2 line-clamp-3">
                {livro.contexto}
              </p>
            )}

            <div className="mt-auto pt-2 text-[11px] font-mono text-muted">
              {mode === "citacoes"
                ? `${livro.citacoes} citaç${livro.citacoes === 1 ? "ão" : "ões"}`
                : livro.ultimaData
                  ? formatDate(livro.ultimaData)
                  : ""}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
