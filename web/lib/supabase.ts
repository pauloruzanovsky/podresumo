import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PAGINA = 1000;

/**
 * Todas as linhas de uma consulta. O Supabase devolve no máximo 1000 por vez
 * e corta o resto em silêncio (a estante já passou disso). `consulta` monta a
 * consulta do zero a cada página, com `.order()` pra paginação ser estável:
 *   todas((de, ate) => supabase.from("livros").select("id").order("id").range(de, ate))
 */
export async function todas<T = any>(
  consulta: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) return { data: linhas, error };
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return { data: linhas, error: null };
  }
}