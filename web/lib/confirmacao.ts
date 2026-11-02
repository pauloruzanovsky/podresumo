import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Link de confirmação da newsletter, assinado em vez de guardado: o e-mail só
 * entra na lista do Resend depois do clique, então não há tabela de pendentes.
 * Vale por 7 dias. Configurar: NEWSLETTER_SEGREDO no .env.local e na Vercel.
 */
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

function assina(conteudo: string, segredo: string): string {
  return createHmac("sha256", segredo).update(conteudo).digest("base64url");
}

export function criaToken(email: string, segredo: string): string {
  const conteudo = `${Buffer.from(email).toString("base64url")}.${Date.now() + VALIDADE_MS}`;
  return `${conteudo}.${assina(conteudo, segredo)}`;
}

/** O e-mail do token, ou null se a assinatura não bate ou o prazo passou. */
export function leToken(token: string, segredo: string): string | null {
  const [email, validade, assinatura] = token.split(".");
  if (!email || !validade || !assinatura) return null;
  const esperada = Buffer.from(assina(`${email}.${validade}`, segredo));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;
  if (Number(validade) < Date.now()) return null;
  return Buffer.from(email, "base64url").toString();
}
