import { unstable_cache } from "next/cache";
import { slugify } from "@/lib/slug";
import { supabase } from "@/lib/supabase";

/**
 * Podcasts que estão no banco mas não aparecem no site.
 *
 * Esconder em vez de apagar: os episódios e as citações continuam lá, e
 * religar é tirar o nome desta lista — sem baixar nem extrair nada de novo.
 * O Modern Wisdom ficou oculto até ser reextraído com o prompt atual (fala,
 * minuto e quem citou), em out/2026.
 */
export const PODCASTS_OCULTOS: string[] = [];

/**
 * Podcasts em outra língua: têm estante própria, mas a fala literal deles não
 * entra no baralho da home, que é a primeira coisa lida em português.
 */
export const PODCASTS_EM_INGLES = ["Modern Wisdom", "The Tim Ferriss Show", "Huberman Lab"];

/**
 * Pra onde vão os links genéricos de "livros" (menu, busca da home, volta da
 * página do livro). Com um podcast só no site, a estante dele É o acervo — a
 * antiga /biblioteca era a mesma lista sem o contexto do programa. Quando
 * voltar a haver mais de um podcast, a biblioteca (no histórico do git, até o
 * commit 905162b) volta como catálogo que cruza todos.
 */
export const ESTANTE_PRINCIPAL = "/podcast/os-socios";
export const TODOS_OS_LIVROS = `${ESTANTE_PRINCIPAL}#todos-os-livros`;
/** A lista de estantes, na home: é pra onde vai o "Estante" do menu. */
export const ESTANTES = "/#estantes";

/**
 * Quem apresenta o programa. Livro escrito por um deles sai das prateleiras
 * de destaque e ganha a "menção honrosa": o Bruno cita o próprio livro em
 * dezenas de episódios, quase sempre divulgando — no ranking geral ele
 * passava na frente de tudo sem ser indicação de leitura.
 */
const AUTORES_DA_CASA = ["Bruno Perini", "Malu Perini", "Chris Williamson"];

/** Quem apresenta cada programa: a busca leva o nome do host ao podcast. */
export const HOSTS: Record<string, string[]> = {
  "Os Sócios Podcast": ["Bruno Perini", "Malu Perini"],
  "Modern Wisdom": ["Chris Williamson"],
  "The Tim Ferriss Show": ["Tim Ferriss"],
  "Huberman Lab": ["Andrew Huberman"],
};

/**
 * Autor que só é "da casa" na própria estante. Os livros do Tim Ferriss são
 * divulgação no programa dele, mas no Os Sócios são recomendação de verdade:
 * tirá-los do site inteiro apagaria o Bruno falando de Trabalhe 4 Horas.
 */
const DA_CASA_SO_NO_PROPRIO_PODCAST: Record<string, string[]> = {
  "The Tim Ferriss Show": ["Tim Ferriss"],
  // Protocols: divulgação no Huberman Lab, indicação no Ferriss e no MW
  "Huberman Lab": ["Andrew Huberman"],
};

/** Quem apresenta fica de fora dos placares de quem mais cita. */
export const APRESENTADORES = [...AUTORES_DA_CASA, "Tim Ferriss", "Andrew Huberman"];

/** `podcast`: a estante em questão; sem ele, a regra do site inteiro. */
export function livroDaCasa(autor?: string | null, podcast?: string | null): boolean {
  if (!autor) return false;
  return (
    AUTORES_DA_CASA.includes(autor) ||
    Boolean(podcast && DA_CASA_SO_NO_PROPRIO_PODCAST[podcast]?.includes(autor))
  );
}

export function podcastVisivel(nome?: string | null): boolean {
  return Boolean(nome) && !PODCASTS_OCULTOS.includes(nome as string);
}

/**
 * Podcasts que a rotina semanal acompanha: entram na lista quando a rotina
 * passa a baixá-los. Os demais são uma seleção de episódios, e o selo diz isso.
 */
const ACOMPANHADOS = ["Os Sócios Podcast"];

export interface EstanteDoMenu {
  nome: string;
  slug: string;
  capa: string | null;
  episodios: number;
  acompanhada: boolean;
  /** "Atualizada até o #322" ou "Seleção de 5 episódios". */
  selo: string;
}

/** Vem do último episódio no banco: o selo não fica dizendo que está em dia
 *  se a rotina parar de rodar. */
async function seloAcompanhada(podcastId: string) {
  const { data } = await supabase
    .from("episodes")
    .select("ep_number, data")
    .eq("podcast_id", podcastId)
    .eq("status", "done")
    .order("data", { ascending: false })
    .limit(1);
  const ultimo = data?.[0];
  if (ultimo?.ep_number) return `Atualizada até o #${ultimo.ep_number}`;
  const dia = ultimo?.data
    ? new Date(`${ultimo.data}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
    : null;
  return dia ? `Atualizada até ${dia}` : "Atualizada";
}

/**
 * As estantes do menu, do maior acervo pro menor. Roda em toda página, por
 * isso o cache: podcast novo não entra todo dia.
 */
export const estantesDoMenu = unstable_cache(
  async (): Promise<EstanteDoMenu[]> => {
    const { data, error } = await supabase
      .from("podcasts")
      .select("id, nome, thumbnail, episodes(count)")
      .eq("episodes.status", "done");
    if (error) throw new Error(error.message);
    const estantes = await Promise.all(
      ((data ?? []) as any[])
        .filter((p) => podcastVisivel(p.nome) && p.episodes?.[0]?.count > 0)
        .map(async (p) => {
          const episodios = p.episodes[0].count as number;
          const acompanhada = ACOMPANHADOS.includes(p.nome);
          return {
            nome: p.nome as string,
            slug: slugify(p.nome),
            capa: (p.thumbnail ?? null) as string | null,
            episodios,
            acompanhada,
            selo: acompanhada
              ? await seloAcompanhada(p.id)
              : `Seleção de ${episodios} ${episodios === 1 ? "episódio" : "episódios"}`,
          };
        })
    );
    return estantes.sort((a, b) => b.episodios - a.episodios);
  },
  ["estantes-do-menu"],
  { revalidate: 86400, tags: ["dados"] }
);
