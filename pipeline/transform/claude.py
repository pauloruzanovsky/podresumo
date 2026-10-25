"""
Transform: Claude API
Transforma transcrição bruta em dados estruturados via IA.
"""

import os
import json
from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

SYSTEM_PROMPT = """Você é um assistente especializado em analisar transcrições de podcasts brasileiros.
Dado uma transcrição, você deve extrair informações estruturadas em JSON.
Responda APENAS com o JSON, sem markdown, sem explicações, sem ```."""

USER_PROMPT_TEMPLATE = """Analise a transcrição abaixo de um episódio de podcast e retorne um JSON com EXATAMENTE esta estrutura:

{{
  "resumo": "Resumo do episódio em 2-3 parágrafos, em português. Capture os pontos principais da conversa.",
  "main_insight": "UMA frase poderosa que resume o maior aprendizado do episódio. Deve ser memorável e acionável.",
  "main_action": "UMA ação concreta e específica que o ouvinte pode tomar hoje baseada no conteúdo do episódio.",
  "topicos": ["Lista de 6-8 tópicos principais abordados no episódio"],
  "capitulos": [
    {{"titulo": "Assunto do trecho", "timestamp": "[HH:MM:SS]"}}
  ],
  "frases": [
    {{"texto": "Uma fala marcante do episódio", "quem": "Nome de quem falou", "timestamp": "[HH:MM:SS]"}}
  ],
  "convidados": ["Nomes dos convidados identificados na conversa (não incluir os hosts)"],
  "convidados_info": [
    {{"nome": "Nome do convidado", "descricao": "Quem é, em uma linha"}}
  ],
  "tags": ["3-5 categorias temáticas, ex: Empreendedorismo, Finanças, Política"],
  "livros": [
    {{"titulo": "Nome da Obra", "autor": "Nome do Autor", "tipo": "livro", "timestamp": "[HH:MM:SS]", "quem_citou": "Nome de quem falou", "natureza": "recomenda", "citacao_literal": "A frase exata dita na conversa", "temas": ["2-4 temas DO LIVRO"], "contexto": "1-2 frases explicando como foi citada na conversa"}}
  ]
}}

REGRAS:
- "livros" deve conter TODAS as obras explicitamente mencionadas na conversa, incluindo contos e artigos científicos citados pelo nome. Revise a transcrição inteira antes de finalizar a lista. Se nenhuma foi citada, retorne lista vazia.
- UMA obra por entrada. Se o convidado cita dois livros na mesma frase ("li Jamaica Inn e Rebecca, da du Maurier"), são DUAS entradas — nunca junte dois títulos num campo "titulo".
- "titulo" é só o título da obra, sem subtítulo longo e sem descrição. Se você só sabe descrever o assunto ("um livro sobre a criação da Nvidia"), esse não é um título — use o título real se ele aparecer na conversa, e omita a obra se não aparecer.
- "autor" é null quando a conversa não diz quem escreveu. Nunca escreva "Não especificado", "Não mencionado" ou variações — use null.
- "tipo" é "livro" para livro, conto ou artigo; "outro" para filme, série, documentário ou qualquer obra que não seja texto publicado.
- "timestamp" é o marcador de tempo da linha onde a obra é mencionada, copiado EXATAMENTE como aparece na transcrição, no formato "[HH:MM:SS]". Cada linha da transcrição começa com um desses marcadores. Copie o da linha da menção — não calcule nem invente. Se a obra for citada mais de uma vez, use a primeira. Se você não conseguir localizar a linha, use null.
- "quem_citou" é o nome de quem mencionou a obra — host ou convidado. A transcrição NÃO identifica quem fala: ela só marca a troca de pessoa com ">>". Preencha só quando a conversa deixa claro quem está falando (a pessoa é chamada pelo nome, fala da própria vida ou obra, responde a uma pergunta dirigida a ela). Quando for palpite — em especial entre dois hosts numa fala curta — use null. Um null é melhor que um nome errado.
- "natureza" é como a obra foi tratada: "recomenda" quando a pessoa indica a leitura ou fala bem dela; "critica" quando discorda ou fala mal; "menciona" quando só cita de passagem, como referência ou exemplo, sem emitir juízo.
- "citacao_literal" é a frase que a pessoa de fato disse sobre a obra, tirada da transcrição. Uma ou duas frases, o suficiente pra fazer sentido sozinha, começando com maiúscula. A transcrição é automática e erra: corrija SÓ o que é erro evidente de reconhecimento de fala — nomes próprios e títulos grafados errado ("pelo doar" → "pelo Dumas", "NIT" → "Nietzsche", "Diab Prada" → "Diabo Veste Prada"), palavra trocada por outra de som parecido quando o contexto não deixa dúvida, pontuação. Pode cortar muletas ("né", "eh", "cara") e repetições de gagueira. NÃO troque palavras por sinônimos, não resuma, não melhore o argumento, não complete o que a pessoa não disse: tem que continuar sendo a fala dela. Se a menção estiver espalhada demais pra isolar uma frase, use null. Não invente fala que não está na transcrição.
- "temas" são 2-4 temas DO LIVRO — do que o livro trata. Não são os temas do episódio. "A Lógica do Cisne Negro" tem temas como Risco, Incerteza e Probabilidade, mesmo que o episódio inteiro seja sobre Bitcoin.
- "contexto" em cada obra deve ser 1-2 frases explicando COMO ela foi citada (ex: "O apresentador recomendou como leitura essencial para entender investimentos").
- "convidados" NÃO deve incluir os hosts do podcast (ex: Bruno Perini, Malu Perini, Chris Williamson).
- A DESCRIÇÃO DO EPISÓDIO é a fonte preferida pra nome e apresentação dos convidados: foi escrita pelo podcast e traz a grafia certa, que a transcrição automática costuma errar. Use essa grafia em "convidados", "convidados_info", "quem_citou" e "quem". Ignore o resto dela: links, anúncios, patrocinadores e chamadas de curso não são conteúdo do episódio. Obra que aparece SÓ na descrição (ex: "autor do livro X") e não é mencionada na conversa NÃO entra em "livros" — sem fala e sem minuto, não é citação.
- "convidados_info" tem uma entrada por nome de "convidados", na mesma ordem. "descricao" é quem a pessoa é, em uma linha (ex: "Dermatologista, criador do canal Sem Filtro"). Tire da descrição do episódio ou do que a conversa diz — não complete com o que você sabe de fora. Se nenhum dos dois apresenta a pessoa, use null.
- "capitulos" são de 6 a 12 trechos do episódio, em ordem cronológica, cobrindo a conversa do começo ao fim. "titulo" é o assunto do trecho em poucas palavras. "timestamp" é o marcador da linha onde o assunto COMEÇA, copiado exatamente da transcrição, no formato "[HH:MM:SS]" — mesma regra do timestamp das obras: copie, não calcule nem invente.
- "frases" são de 3 a 5 falas marcantes do episódio — as que alguém destacaria ou compartilharia. Não precisam ter relação com livros. "texto" segue a MESMA regra de "citacao_literal": é a fala da pessoa, tirada da transcrição, corrigindo só erro evidente de reconhecimento de fala e cortando muletas; nunca parafraseie nem melhore. Uma ou duas frases, que façam sentido sozinhas. "quem" é quem falou (null se não der pra identificar). "timestamp" é o marcador da linha, copiado da transcrição.
- "tags" devem ser categorias amplas e reutilizáveis.
- Tudo em português brasileiro.

TÍTULO DO EPISÓDIO: {titulo}

DESCRIÇÃO DO EPISÓDIO (escrita pelo próprio podcast, publicada no YouTube):
{descricao}

TRANSCRIÇÃO:
{transcript}"""


def _lista(descricao: str) -> dict:
    return {"type": "array", "items": {"type": "string"}, "description": descricao}


_TEXTO_OU_NULL = {"anyOf": [{"type": "string"}, {"type": "null"}]}


def _objetos(campos: dict) -> dict:
    """Lista de objetos com todos os campos obrigatórios."""
    return {
        "type": "array",
        "items": {
            "type": "object",
            "properties": campos,
            "required": list(campos),
            "additionalProperties": False,
        },
    }


# Schema do structured output: a API garante um JSON válido nesta forma, o que
# elimina o parse por regex (que devolvia {} silenciosamente e fazia o episódio
# ser salvo sem resumo nem livros).
OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "resumo": {"type": "string"},
        "main_insight": {"type": "string"},
        "main_action": {"type": "string"},
        "topicos": _lista("6-8 tópicos principais"),
        # Os três abaixo entraram porque a transcrição é ~85% do custo da
        # chamada e é paga de qualquer jeito: pedir junto custa centavos de
        # saída, pedir depois custa reler todos os episódios.
        "capitulos": _objetos({
            "titulo": {"type": "string"},
            "timestamp": _TEXTO_OU_NULL,
        }),
        "frases": _objetos({
            "texto": {"type": "string"},
            "quem": _TEXTO_OU_NULL,
            "timestamp": _TEXTO_OU_NULL,
        }),
        "convidados": _lista("convidados, sem os hosts"),
        "convidados_info": _objetos({
            "nome": {"type": "string"},
            "descricao": _TEXTO_OU_NULL,
        }),
        "tags": _lista("3-5 categorias temáticas amplas"),
        "livros": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "titulo": {"type": "string"},
                    "autor": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "tipo": {"type": "string", "enum": ["livro", "outro"]},
                    # Copiado da transcrição, que já vem com [HH:MM:SS] por
                    # linha. É extração, não cálculo — e é mais confiável que
                    # a busca por palavra-chave do fix_timestamps, que erra
                    # justamente nos livros citados por descrição.
                    "timestamp": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "quem_citou": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                    "natureza": {
                        "type": "string",
                        "enum": ["recomenda", "menciona", "critica"],
                    },
                    # A fala da pessoa, não paráfrase. É o que diferencia
                    # "resumo sobre um podcast" de "o podcast indexado". Só
                    # erro evidente da transcrição automática é corrigido
                    # (nomes, títulos, muletas): crua, ela aparecia no site
                    # com "pelo doar" no lugar de Dumas.
                    "citacao_literal": {
                        "anyOf": [{"type": "string"}, {"type": "null"}]
                    },
                    # Temas DO LIVRO. `livros.temas` antes vinha das tags do
                    # episódio, o que marcava Taleb como "Bitcoin".
                    "temas": {"type": "array", "items": {"type": "string"}},
                    "contexto": {"type": "string"},
                },
                "required": [
                    "titulo", "autor", "tipo", "timestamp", "quem_citou",
                    "natureza", "citacao_literal", "temas", "contexto",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": [
        "resumo", "main_insight", "main_action",
        "topicos", "capitulos", "frases",
        "convidados", "convidados_info", "tags", "livros",
    ],
    "additionalProperties": False,
}


MODELO_PADRAO = "claude-opus-5"

# Suba a cada mudança de prompt ou schema que altere o que é extraído. É o que
# vai gravado em `episodes.extrator` e permite listar os episódios que ficaram
# com a versão antiga.
#   v2: Opus 5, citação literal crua, quem citou, natureza, temas do livro
#   v3: citação com erro de transcrição corrigido; capítulos, frases e
#       apresentação dos convidados
#   v4: descrição do YouTube no prompt (nome e apresentação dos convidados);
#       quem_citou vira null quando é palpite
VERSAO_PROMPT = "v4"


def extrator(model: str = MODELO_PADRAO) -> str:
    """Identificador gravado junto do episódio: "<modelo>/<versão do prompt>"."""
    return f"{model}/{VERSAO_PROMPT}"

# Opus 5 tem janela de 1M tokens; o corte aqui é só trava de segurança contra
# transcrição corrompida. O limite antigo (150k) cortava episódios longos no
# meio, e os livros citados na última hora sumiam.
MAX_CHARS = 600_000

# Descrições passam de 4 mil caracteres quando têm muito anúncio; a
# apresentação do convidado vem no começo.
MAX_DESCRICAO = 5_000


def monta_params(
    transcript: str,
    titulo: str,
    model: str = MODELO_PADRAO,
    descricao: str | None = None,
) -> dict:
    """Parâmetros da requisição, compartilhados pelo caminho síncrono e pelo
    lote. Ficam numa função só pra prompt, schema e modelo não divergirem
    entre os dois com o tempo."""
    if len(transcript) > MAX_CHARS:
        transcript = transcript[:MAX_CHARS]

    return {
        "model": model,
        "max_tokens": 16000,
        # `effort` é o botão de custo/qualidade: suba pra "high" se a extração
        # de livros começar a passar batido, desça pra "low" pra economizar.
        "output_config": {
            "effort": "medium",
            "format": {"type": "json_schema", "schema": OUTPUT_SCHEMA},
        },
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": USER_PROMPT_TEMPLATE.format(
                    titulo=titulo,
                    descricao=(descricao or "").strip()[:MAX_DESCRICAO]
                    or "(não disponível)",
                    transcript=transcript,
                ),
            }
        ],
    }


def extrai_json(message) -> dict:
    """Lê o JSON da resposta, tratando os modos de falha. Compartilhado com o
    lote, onde a mensagem vem do resultado do batch em vez da chamada direta."""
    if message.stop_reason == "refusal":
        categoria = getattr(getattr(message, "stop_details", None), "category", None)
        print(f"❌ Requisição recusada: {categoria}")
        return {}
    if message.stop_reason == "max_tokens":
        print("❌ Resposta truncada em max_tokens — aumente o limite e reprocesse")
        return {}

    # Com thinking ligado (padrão do Opus 5) o primeiro bloco é de pensamento,
    # não de texto — pegar content[0].text quebraria aqui.
    texto = next((b.text for b in message.content if b.type == "text"), "")
    if not texto:
        print("❌ Resposta sem bloco de texto")
        return {}
    return json.loads(texto)


def process_transcript(
    transcript: str,
    titulo: str,
    model: str = MODELO_PADRAO,
    descricao: str | None = None,
) -> dict:
    """
    Envia a transcrição ao Claude e retorna dados estruturados.

    Args:
        transcript: Texto completo da transcrição
        titulo: Título do episódio (ajuda o Claude a contextualizar)
        model: Sobrescreve o modelo — usado pra comparar custo/qualidade

    Returns:
        Dict com: resumo, main_insight, main_action, topicos, convidados, tags, livros
    """
    print(f"🤖 Processando com Claude: {titulo[:60]}...")
    if len(transcript) > MAX_CHARS:
        print(f"   ⚠️ Transcrição truncada para {MAX_CHARS} caracteres")

    message = client.messages.create(
        **monta_params(transcript, titulo, model, descricao)
    )
    result = extrai_json(message)
    if result:
        u = message.usage
        print(f"✅ Processado com sucesso "
              f"({model} · entrada {u.input_tokens:,} · saída {u.output_tokens:,} tokens)")
    return result


# ─── Teste direto ───
if __name__ == "__main__":
    from extract.transcript import fetch_transcript

    # Busca transcrição de um episódio real
    video_id = "JJ5BXKnVvXk"
    titulo = "O MAIOR QI DO BRASIL: COMO PENSA UMA MENTE FORA DA CURVA?"

    transcript = fetch_transcript(video_id)

    if transcript:
        result = process_transcript(transcript, titulo)
        print("\n" + json.dumps(result, indent=2, ensure_ascii=False))
