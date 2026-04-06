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
  "convidados": ["Nomes dos convidados identificados na conversa (não incluir os hosts)"],
  "tags": ["3-5 categorias temáticas, ex: Empreendedorismo, Finanças, Política"],
  "livros": [
    {{"titulo": "Nome do Livro", "autor": "Nome do Autor", "contexto": "1-2 frases explicando como o livro foi citado na conversa"}}
  ]
}}

REGRAS:
- "livros" deve conter TODOS os livros explicitamente mencionados na conversa, incluindo contos e artigos científicos citados pelo nome. Revise a transcrição inteira antes de finalizar a lista. Se nenhum foi citado, retorne lista vazia.
- "contexto" em cada livro deve ser 1-2 frases explicando COMO o livro foi citado (ex: "O apresentador recomendou como leitura essencial para entender investimentos").
- "convidados" NÃO deve incluir os hosts do podcast (ex: Bruno Perini, Malu Perini, Chris Williamson).
- "tags" devem ser categorias amplas e reutilizáveis.
- Tudo em português brasileiro.

TÍTULO DO EPISÓDIO: {titulo}

TRANSCRIÇÃO:
{transcript}"""


def process_transcript(transcript: str, titulo: str) -> dict:
    """
    Envia a transcrição ao Claude e retorna dados estruturados.

    Args:
        transcript: Texto completo da transcrição
        titulo: Título do episódio (ajuda o Claude a contextualizar)

    Returns:
        Dict com: resumo, main_insight, main_action, topicos, convidados, tags, livros
    """
    print(f"🤖 Processando com Claude: {titulo[:60]}...")

    # Truncar transcrição se muito longa (limite do contexto)
    max_chars = 150_000  # ~37k tokens, seguro para Sonnet
    if len(transcript) > max_chars:
        transcript = transcript[:max_chars]
        print(f"   ⚠️ Transcrição truncada para {max_chars} caracteres")

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        temperature=0.2,
        messages=[
            {
                "role": "user",
                "content": USER_PROMPT_TEMPLATE.format(
                    titulo=titulo,
                    transcript=transcript,
                ),
            }
        ],
        system=SYSTEM_PROMPT,
    )

    # Extrair o texto da resposta
    response_text = message.content[0].text

    # Parsear o JSON
    try:
        result = json.loads(response_text)
    except json.JSONDecodeError:
        # Tenta extrair JSON se veio com markdown
        import re
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json.loads(json_match.group())
        else:
            print(f"❌ Resposta não é JSON válido: {response_text[:200]}")
            return {}

    print(f"✅ Processado com sucesso")
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
