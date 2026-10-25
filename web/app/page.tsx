import { supabase } from "@/lib/supabase";
import { APRESENTADORES, livroDaCasa, podcastVisivel } from "@/lib/podcasts";
import { Posicao } from "@/components/Rankings";
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
        "id, titulo, autor, capa_url, episode_livros(episode_id, contexto, quem_citou, episodes(data, podcast_id))"
      )
      .eq("tipo", "livro"), // filme/documentário/série citados ficam de fora
    supabase.from("podcasts").select("id, nome", { count: "exact" }),
    supabase.from("episodes").select("podcast_id").eq("status", "done"),
  ]);

  // Podcast oculto (lib/podcasts) some de tudo: estantes, contagens e das
  // citações que fazem um livro aparecer.
  const visiveis = ((podcastsRes.data ?? []) as any[]).filter((p) =>
    podcastVisivel(p.nome)
  );
  const idsVisiveis = new Set(visiveis.map((p) => p.id));

  if (livrosRes.error) {
    return (
      <p className="text-red-600">
        Erro ao carregar livros: {livrosRes.error.message}
      </p>
    );
  }

  const livros: LivroCard[] = ((livrosRes.data ?? []) as any[])
    .map((livro: any) => {
      const rels: any[] = (livro.episode_livros ?? []).filter((r: any) =>
        idsVisiveis.has(r.episodes?.podcast_id)
      );
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

  const totalLivros = livros.length;
  const totalEpisodes = ((episodesRes.data ?? []) as any[]).filter((e) =>
    idsVisiveis.has(e.podcast_id)
  ).length;
  const totalPodcasts = visiveis.length;
  // Uma estante por podcast: quantos livros ela tem e as capas dos mais
  // citados ali, pra prateleira já mostrar o que tem dentro.
  const estantes = visiveis
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
      // Pódio da estante: 3 livros, 3 convidados, 3 autores. Mesmas regras
      // dos placares da página do podcast — o livro e os nomes de quem
      // apresenta ficam de fora da disputa.
      const citacoesDaqui = ((livrosRes.data ?? []) as any[]).flatMap((livro) =>
        ((livro.episode_livros ?? []) as any[])
          .filter((r) => r.episodes?.podcast_id === p.id)
          .map((r) => ({ livro, quem: (r.quem_citou ?? "").trim() }))
      );
      const conta = (chaves: string[]) => {
        const n = new Map<string, number>();
        for (const k of chaves) n.set(k, (n.get(k) ?? 0) + 1);
        return [...n.entries()]
          .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
          .slice(0, 3)
          .map(([nome, vezes]) => ({ nome, vezes }));
      };
      const podioLivros = [...daqui]
        .filter((l) => !livroDaCasa(l.autor))
        .sort((x, y) => y.vezes - x.vezes || x.titulo.localeCompare(y.titulo))
        .slice(0, 3);
      const podioPessoas = conta(
        citacoesDaqui.map((c) => c.quem).filter((q) => q && !APRESENTADORES.includes(q))
      );
      const podioAutores = conta(
        citacoesDaqui
          .map((c) => c.livro.autor as string | null)
          .filter((a): a is string => Boolean(a) && !livroDaCasa(a))
      );

      return {
        nome: p.nome as string,
        slug: slugify(p.nome),
        total: daqui.length,
        // prateleira larga (estante única) comporta mais livros
        capas: daqui.slice(0, 12),
        podioLivros,
        podioPessoas,
        podioAutores,
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
          Os livros citados nos podcasts, com a fala de quem citou e o
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
          <div
            className={`grid grid-cols-1 gap-5 ${estantes.length > 1 ? "md:grid-cols-2" : ""}`}
          >
            {estantes.map((e) => (
              <div
                key={e.slug}
                className="p-5 sm:p-6 bg-card border border-border rounded-2xl"
              >
                <Link href={`/podcast/${e.slug}`} className="group block">
                  {/* Livros de pé sobre a prateleira */}
                  <div className="flex items-end gap-2 sm:gap-3 px-1">
                    {e.capas.map((l, i) => (
                      <BookCover
                        key={l.id}
                        titulo={l.titulo}
                        autor={l.autor}
                        capaUrl={l.capaUrl}
                        // Seis cabem no celular e em meia largura; os demais só
                        // entram quando a estante ocupa a linha inteira.
                        className={`flex-1 min-w-0 max-w-[84px] shadow-md rounded-b-none ${
                          i >= 6 ? (estantes.length > 1 ? "hidden" : "hidden md:block") : ""
                        }`}
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

                {/* Pódio: o gosto da estante, cada item leva pra ela já filtrada */}
                <div
                  className={`grid grid-cols-1 gap-6 mt-6 pt-6 border-t border-border ${
                    estantes.length > 1 ? "" : "md:grid-cols-3"
                  }`}
                >
                  <Podio titulo="Livros mais citados">
                    {e.podioLivros.map((l, i) => (
                      <li key={l.id}>
                        <Link href={`/livro/${l.id}`} className="group flex items-center gap-3">
                          <Posicao i={i} />
                          <BookCover
                            titulo={l.titulo}
                            autor={l.autor}
                            capaUrl={l.capaUrl}
                            className="w-8 shrink-0 shadow-sm"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug line-clamp-1 group-hover:underline">
                              {l.titulo}
                            </span>
                            <span className="block text-xs text-muted">{l.vezes} citações</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </Podio>
                  <Podio titulo="Quem mais cita">
                    {e.podioPessoas.map((pessoa, i) => (
                      <li key={pessoa.nome}>
                        <Link
                          href={`/podcast/${e.slug}?pessoa=${encodeURIComponent(pessoa.nome)}#todos-os-livros`}
                          className="group flex items-center gap-3"
                        >
                          <Posicao i={i} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug truncate group-hover:underline">
                              {pessoa.nome}
                            </span>
                            <span className="block text-xs text-muted">{pessoa.vezes} citações</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </Podio>
                  <Podio titulo="Autores que voltam">
                    {e.podioAutores.map((autor, i) => (
                      <li key={autor.nome}>
                        <Link
                          href={`/podcast/${e.slug}?q=${encodeURIComponent(autor.nome)}#todos-os-livros`}
                          className="group flex items-center gap-3"
                        >
                          <Posicao i={i} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-snug truncate group-hover:underline">
                              {autor.nome}
                            </span>
                            <span className="block text-xs text-muted">{autor.vezes} citações</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </Podio>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

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

function Podio({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-3">
        {titulo}
      </h3>
      <ol className="flex flex-col gap-3">{children}</ol>
    </div>
  );
}
