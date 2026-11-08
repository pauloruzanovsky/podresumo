import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O site lê o retrato do banco (retrato/dados.json, gerado no build por
 * scripts/retrato.mjs), não o Supabase. Este arquivo responde às mesmas
 * consultas que as páginas já faziam — `supabase.from(...).select(...)` com
 * os filtros de sempre — só que em memória. Por isso as páginas só trocaram
 * o import.
 *
 * Cobre o pedaço do PostgREST que o site usa: colunas, `*`, relação embutida
 * (com `!inner` e `(count)`), filtro em coluna da relação ("livros.tipo"),
 * eq, neq, in, not is null, ilike, overlaps, order, range, limit, single,
 * maybeSingle e count. Consulta fora disso lança erro em vez de responder
 * errado.
 */

type Linha = Record<string, any>;
type Tabela = "podcasts" | "episodes" | "livros" | "episode_livros";

interface Retrato {
  gerado_em: string;
  podcasts: Linha[];
  episodes: Linha[];
  livros: Linha[];
  episode_livros: Linha[];
}

// ---------------------------------------------------------------- retrato

interface Base {
  gerado_em: string;
  tabelas: Record<Tabela, Linha[]>;
  porId: Record<Tabela, Map<string, Linha>>;
  citacoesDoEpisodio: Map<string, Linha[]>;
  citacoesDoLivro: Map<string, Linha[]>;
  episodiosDoPodcast: Map<string, Linha[]>;
  /** resultado das consultas já feitas (só as linhas-raiz, na ordem) */
  memo: Map<string, Linha[]>;
}

let base: Base | null = null;

function agrupa(linhas: Linha[], chave: string) {
  const m = new Map<string, Linha[]>();
  for (const l of linhas) {
    const k = l[chave];
    if (k == null) continue;
    const lista = m.get(k);
    if (lista) lista.push(l);
    else m.set(k, [l]);
  }
  return m;
}

function carrega(): Base {
  if (base) return base;
  const r: Retrato = JSON.parse(
    readFileSync(join(process.cwd(), "retrato", "dados.json"), "utf8")
  );
  const tabelas = {
    podcasts: r.podcasts,
    episodes: r.episodes,
    livros: r.livros,
    episode_livros: r.episode_livros,
  };
  const porId = {} as Base["porId"];
  for (const [nome, linhas] of Object.entries(tabelas) as [Tabela, Linha[]][])
    porId[nome] = new Map(linhas.filter((l) => l.id != null).map((l) => [l.id, l]));
  base = {
    gerado_em: r.gerado_em,
    tabelas,
    porId,
    citacoesDoEpisodio: agrupa(r.episode_livros, "episode_id"),
    citacoesDoLivro: agrupa(r.episode_livros, "livro_id"),
    episodiosDoPodcast: agrupa(r.episodes, "podcast_id"),
    memo: new Map(),
  };
  return base;
}

/** Quando o retrato foi tirado do banco. */
export function retratoGeradoEm(): string {
  return carrega().gerado_em;
}

// ------------------------------------------------------------- relações

interface Relacao {
  tabela: Tabela;
  /** a linha do outro lado: uma (to-one) ou várias (to-many) */
  busca: (b: Base, linha: Linha) => Linha[];
  muitos: boolean;
}

const um = (tabela: Tabela, coluna: string): Relacao => ({
  tabela,
  muitos: false,
  busca: (b, l) => {
    const alvo = l[coluna] == null ? undefined : b.porId[tabela].get(l[coluna]);
    return alvo ? [alvo] : [];
  },
});

const RELACOES: Record<Tabela, Record<string, Relacao>> = {
  podcasts: {
    episodes: { tabela: "episodes", muitos: true, busca: (b, l) => b.episodiosDoPodcast.get(l.id) ?? [] },
  },
  episodes: {
    podcasts: um("podcasts", "podcast_id"),
    episode_livros: {
      tabela: "episode_livros",
      muitos: true,
      busca: (b, l) => b.citacoesDoEpisodio.get(l.id) ?? [],
    },
  },
  livros: {
    episode_livros: {
      tabela: "episode_livros",
      muitos: true,
      busca: (b, l) => b.citacoesDoLivro.get(l.id) ?? [],
    },
  },
  episode_livros: {
    episodes: um("episodes", "episode_id"),
    livros: um("livros", "livro_id"),
  },
};

// --------------------------------------------------------------- select

type Campo =
  | { tipo: "tudo" }
  | { tipo: "coluna"; nome: string }
  | { tipo: "relacao"; nome: string; inner: boolean; campos: Campo[] };

/** Divide "a, b(c, d), e" nas vírgulas de fora dos parênteses. */
function partes(texto: string): string[] {
  const saida: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const ch of texto) {
    if (ch === "(") nivel++;
    if (ch === ")") nivel--;
    if (ch === "," && nivel === 0) {
      saida.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}

const memoSelect = new Map<string, Campo[]>();

function parseSelect(texto: string): Campo[] {
  const pronto = memoSelect.get(texto);
  if (pronto) return pronto;
  const campos = partes(texto.replace(/\s+/g, " ")).map((p): Campo => {
    if (p === "*") return { tipo: "tudo" };
    const m = p.match(/^([a-z_]+)(!inner)?\(([\s\S]*)\)$/);
    if (m) return { tipo: "relacao", nome: m[1], inner: Boolean(m[2]), campos: parseSelect(m[3]) };
    if (/^[a-z_]+$/.test(p)) return { tipo: "coluna", nome: p };
    throw new Error(`dados: select não suportado: "${p}"`);
  });
  memoSelect.set(texto, campos);
  return campos;
}

// -------------------------------------------------------------- filtros

interface Filtro {
  /** ["tipo"] na tabela da consulta; ["livros", "tipo"] na relação */
  caminho: string[];
  passa: (valor: any) => boolean;
  chave: string;
}

const texto = (v: any) => (v == null ? v : String(v));

function regexIlike(padrao: string) {
  const corpo = padrao
    .split("")
    .map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${corpo}$`, "is");
}

// ------------------------------------------------------------- consulta

interface Resposta<D = any> {
  data: D;
  error: { message: string } | null;
  count: number | null;
}

class Consulta<D = any[]> implements PromiseLike<Resposta<D>> {
  private campos: Campo[] = [{ tipo: "tudo" }];
  private textoSelect = "*";
  private filtros: Filtro[] = [];
  private ordens: { coluna: string; asc: boolean }[] = [];
  private faixa: [number, number] | null = null;
  private unico: "single" | "maybe" | null = null;
  private contar = false;
  private soContagem = false;

  private tabela: Tabela;

  constructor(tabela: Tabela) {
    if (!RELACOES[tabela]) throw new Error(`dados: tabela desconhecida "${tabela}"`);
    this.tabela = tabela;
  }

  select(colunas = "*", opcoes?: { count?: "exact"; head?: boolean }) {
    this.textoSelect = colunas;
    this.campos = parseSelect(colunas);
    this.contar = Boolean(opcoes?.count);
    this.soContagem = Boolean(opcoes?.head);
    return this;
  }

  private filtra(coluna: string, op: string, valor: any, passa: (v: any) => boolean) {
    const caminho = coluna.split(".");
    if (caminho.length > 2) throw new Error(`dados: filtro fundo demais "${coluna}"`);
    this.filtros.push({ caminho, passa, chave: `${coluna}:${op}:${JSON.stringify(valor)}` });
    return this;
  }

  eq(coluna: string, valor: any) {
    return this.filtra(coluna, "eq", valor, (v) => v != null && texto(v) === texto(valor));
  }
  neq(coluna: string, valor: any) {
    return this.filtra(coluna, "neq", valor, (v) => v != null && texto(v) !== texto(valor));
  }
  in(coluna: string, valores: any[]) {
    const s = new Set(valores.map(texto));
    return this.filtra(coluna, "in", valores, (v) => v != null && s.has(texto(v)));
  }
  not(coluna: string, op: string, valor: any) {
    if (op !== "is" || valor !== null) throw new Error(`dados: not(${op}, ${valor}) não suportado`);
    return this.filtra(coluna, "notnull", null, (v) => v != null);
  }
  ilike(coluna: string, padrao: string) {
    const re = regexIlike(padrao);
    return this.filtra(coluna, "ilike", padrao, (v) => typeof v === "string" && re.test(v));
  }
  overlaps(coluna: string, valores: any[]) {
    const s = new Set(valores);
    return this.filtra(coluna, "ov", valores, (v) => Array.isArray(v) && v.some((x) => s.has(x)));
  }

  order(coluna: string, opcoes?: { ascending?: boolean }) {
    if (coluna.includes(".")) throw new Error(`dados: order em relação "${coluna}"`);
    this.ordens.push({ coluna, asc: opcoes?.ascending ?? true });
    return this;
  }
  range(de: number, ate: number) {
    this.faixa = [de, ate];
    return this;
  }
  limit(n: number) {
    this.faixa = [0, n - 1];
    return this;
  }
  // como no supabase-js: com single/maybeSingle o dado deixa de ser lista
  single(): Consulta<any> {
    this.unico = "single";
    return this as Consulta<any>;
  }
  maybeSingle(): Consulta<any> {
    this.unico = "maybe";
    return this as Consulta<any>;
  }

  // filtros da relação `nome`, aplicados às linhas do outro lado
  private filtrosDe(nome: string) {
    return this.filtros.filter((f) => f.caminho.length === 2 && f.caminho[0] === nome);
  }

  /** Monta a linha com os campos pedidos; null se um `!inner` não achou nada. */
  private monta(b: Base, tabela: Tabela, linha: Linha, campos: Campo[], raiz: boolean): Linha | null {
    const saida: Linha = {};
    for (const c of campos) {
      if (c.tipo === "tudo") {
        for (const [k, v] of Object.entries(linha)) saida[k] = Array.isArray(v) ? v.slice() : v;
      } else if (c.tipo === "coluna") {
        const v = linha[c.nome];
        saida[c.nome] = Array.isArray(v) ? v.slice() : v;
      } else {
        const rel = RELACOES[tabela][c.nome];
        if (!rel) throw new Error(`dados: relação desconhecida ${tabela}.${c.nome}`);
        let alvos = rel.busca(b, linha);
        const filtros = raiz ? this.filtrosDe(c.nome) : [];
        if (filtros.length) alvos = alvos.filter((a) => filtros.every((f) => f.passa(a[f.caminho[1]])));
        const contagem = c.campos.length === 1 && c.campos[0].tipo === "coluna" && c.campos[0].nome === "count";
        if (contagem) {
          if (c.inner && !alvos.length) return null;
          saida[c.nome] = [{ count: alvos.length }];
          continue;
        }
        const montados = alvos
          .map((a) => this.monta(b, rel.tabela, a, c.campos, false))
          .filter((a): a is Linha => a !== null);
        if (c.inner && !montados.length) return null;
        saida[c.nome] = rel.muitos ? montados : (montados[0] ?? null);
      }
    }
    return saida;
  }

  private compara = (a: Linha, b: Linha) => {
    for (const { coluna, asc } of this.ordens) {
      const x = a[coluna];
      const y = b[coluna];
      if (x === y) continue;
      // Postgres: nulo por último no crescente, primeiro no decrescente
      if (x == null) return asc ? 1 : -1;
      if (y == null) return asc ? -1 : 1;
      if (x < y) return asc ? -1 : 1;
      if (x > y) return asc ? 1 : -1;
    }
    return 0;
  };

  /** As linhas-raiz que passam em tudo, na ordem; guardado pra paginação. */
  private raizes(b: Base): Linha[] {
    const chave = [
      this.tabela,
      this.textoSelect,
      ...this.filtros.map((f) => f.chave).sort(),
      ...this.ordens.map((o) => `${o.coluna}:${o.asc}`),
    ].join("|");
    const pronto = b.memo.get(chave);
    if (pronto) return pronto;
    const daRaiz = this.filtros.filter((f) => f.caminho.length === 1);
    const linhas = b.tabelas[this.tabela]
      .filter((l) => daRaiz.every((f) => f.passa(l[f.caminho[0]])))
      .filter((l) => this.monta(b, this.tabela, l, this.campos, true) !== null);
    if (this.ordens.length) linhas.sort(this.compara);
    if (b.memo.size > 500) b.memo.clear();
    b.memo.set(chave, linhas);
    return linhas;
  }

  private executa(): Resposta {
    for (const f of this.filtros)
      if (f.caminho.length === 2 && !this.campos.some((c) => c.tipo === "relacao" && c.nome === f.caminho[0]))
        throw new Error(`dados: filtro em "${f.caminho.join(".")}" sem a relação no select`);
    const b = carrega();
    const todas = this.raizes(b);
    const count = this.contar ? todas.length : null;
    if (this.soContagem) return { data: null, error: null, count };
    const fatia = this.faixa ? todas.slice(this.faixa[0], this.faixa[1] + 1) : todas;
    const data = fatia.map((l) => this.monta(b, this.tabela, l, this.campos, true)!);
    if (this.unico === "maybe") {
      if (data.length > 1) return { data: null, error: { message: "mais de uma linha" }, count };
      return { data: data[0] ?? null, error: null, count };
    }
    if (this.unico === "single") {
      if (data.length !== 1)
        return { data: null, error: { message: `esperava 1 linha, veio ${data.length}` }, count };
      return { data: data[0], error: null, count };
    }
    return { data, error: null, count };
  }

  then<A = Resposta<D>, B = never>(
    ok?: ((r: Resposta<D>) => A | PromiseLike<A>) | null,
    falha?: ((e: any) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return new Promise<Resposta<D>>((resolve) => resolve(this.executa() as Resposta<D>)).then(ok, falha);
  }
}

/** Mesmo jeito de consultar do supabase-js, lendo o retrato. */
export const supabase = {
  from: (tabela: string) => new Consulta<any[]>(tabela as Tabela),
};

/**
 * Todas as linhas de uma consulta paginada. Mantido igual ao de
 * lib/supabase.ts pra as páginas não mudarem.
 */
export async function todas<T = any>(
  consulta: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const PAGINA = 1000;
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) return { data: linhas, error };
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { data: linhas, error: null };
  }
}
