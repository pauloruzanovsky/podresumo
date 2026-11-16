-- Tamanho do banco, pro painel de controle (pipeline/flows/painel.py).
-- O plano grátis do Supabase dá 0,5 GB; o painel mostra o uso contra isso.
-- Só a service role (o pipeline) pode chamar: o site e o público não.

CREATE OR REPLACE FUNCTION public.tamanho_banco()
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_database_size(current_database());
$$;

REVOKE EXECUTE ON FUNCTION public.tamanho_banco() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tamanho_banco() TO service_role;
