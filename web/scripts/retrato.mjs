/**
 * Retrato do banco pro site: lê o Supabase uma vez, no build, e grava
 * retrato/dados.json. As páginas leem esse arquivo (lib/dados.ts) e não
 * tocam no banco: com o Supabase travado (08/11/2026, plano grátis sem
 * memória) o site segue inteiro.
 *
 * Roda sozinho antes do `next build` (prebuild). Dado novo entra no site com
 * um deploy novo: o pipeline chama o deploy hook no fim da coleta
 * (flows/atualizar_site.py).
 *
 * Na Vercel, banco fora do ar faz o build falhar, e a versão no ar continua.
 * Na máquina local, se já houver um retrato, ele fica e o build segue.
 *
 *   node scripts/retrato.mjs
 */
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAIDA = join(RAIZ, "retrato", "dados.json");

if (!process.env.NEXT_PUBLIC_SUPABASE_URL && existsSync(join(RAIZ, ".env.local"))) {
  process.loadEnvFile(join(RAIZ, ".env.local"));
}
const URL_BANCO = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// a transcrição é o grosso do banco (~265 KB por episódio) e o site não mostra
const COLUNAS = {
  podcasts: "*",
  episodes:
    "id,podcast_id,titulo,data,duracao,thumbnail,convidados,tags,resumo,main_insight," +
    "main_action,topicos,link_youtube,status,processed_at,ep_number,capitulos,frases," +
    "convidados_info,slug",
  livros: "*",
  episode_livros: "*",
};
const ORDEM = {
  podcasts: "id",
  episodes: "id",
  livros: "id",
  episode_livros: "episode_id,livro_id",
};
const FILTRO = { episodes: "&status=eq.done" };
const PAGINA = 1000;

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina(tabela, de) {
  const url =
    `${URL_BANCO}/rest/v1/${tabela}?select=${COLUNAS[tabela]}&order=${ORDEM[tabela]}` +
    `${FILTRO[tabela] ?? ""}&offset=${de}&limit=${PAGINA}`;
  for (let tentativa = 1; ; tentativa++) {
    try {
      const res = await fetch(url, {
        headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}` },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      return await res.json();
    } catch (erro) {
      if (tentativa >= 4) throw new Error(`${tabela} (a partir de ${de}): ${erro.message}`);
      console.warn(`  retrato: ${tabela} falhou (${erro.message}); tentando de novo`);
      await espera(5_000 * tentativa);
    }
  }
}

async function tabela(nome) {
  const linhas = [];
  for (let de = 0; ; de += PAGINA) {
    const parte = await pagina(nome, de);
    linhas.push(...parte);
    if (parte.length < PAGINA) return linhas;
  }
}

async function main() {
  if (!URL_BANCO || !CHAVE) throw new Error("falta NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  const inicio = Date.now();
  // uma tabela por vez: o banco é pequeno e não aguenta rajada
  const podcasts = await tabela("podcasts");
  const episodes = await tabela("episodes");
  const livros = await tabela("livros");
  const feitos = new Set(episodes.map((e) => e.id));
  const episode_livros = (await tabela("episode_livros")).filter((r) => feitos.has(r.episode_id));

  const dados = { gerado_em: new Date().toISOString(), podcasts, episodes, livros, episode_livros };
  mkdirSync(dirname(SAIDA), { recursive: true });
  // grava ao lado e troca: build interrompido não deixa retrato pela metade
  writeFileSync(`${SAIDA}.tmp`, JSON.stringify(dados));
  renameSync(`${SAIDA}.tmp`, SAIDA);
  const mb = (statSync(SAIDA).size / 1e6).toFixed(1);
  console.log(
    `  retrato: ${podcasts.length} podcasts, ${episodes.length} episódios, ${livros.length} livros, ` +
      `${episode_livros.length} citações, ${mb} MB em ${((Date.now() - inicio) / 1000).toFixed(0)} s`
  );
}

main().catch((erro) => {
  if (!process.env.VERCEL && existsSync(SAIDA)) {
    console.warn(`  retrato: banco falhou (${erro.message}); sigo com o retrato que já existe`);
    return;
  }
  console.error(`  retrato: ${erro.message}`);
  process.exit(1);
});
