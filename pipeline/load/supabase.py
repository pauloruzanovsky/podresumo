"""
Load: Supabase (PostgreSQL)
Insere episódios processados no banco de dados.
"""

import os
import re
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)


def campos_extras(ai_data: dict) -> dict:
    """Capítulos, frases e apresentação dos convidados, prontos pro banco
    (colunas JSONB da migração 005). Os marcadores "[HH:MM:SS]" viram
    segundos aqui, uma vez, em vez de em cada página que for exibir."""
    def com_segundos(itens):
        return [
            {**{k: v for k, v in item.items() if k != "timestamp"},
             "timestamp_seg": para_segundos(item.get("timestamp"))}
            for item in itens or []
        ]

    return {
        "capitulos": com_segundos(ai_data.get("capitulos")),
        "frases": com_segundos(ai_data.get("frases")),
        "convidados_info": ai_data.get("convidados_info") or [],
    }


def grava_campos_ia(
    video_id: str, ai_data: dict, extrator: str, extraido_em: str | None = None
):
    """Atualiza só o que vem da IA num episódio que já existe. Título, data e
    thumbnail vêm do YouTube e não são tocados.

    `extrator` e `extraido_em` registram com qual versão e quando a extração
    foi feita — passe os do arquivo salvo quando estiver regravando do cache.
    """
    supabase.table("episodes").update({
        # Episódio que entrou só com a transcrição (pending) passa a aparecer
        # no site aqui.
        "status": "done",
        "processed_at": datetime.now().isoformat(),
        "extrator": extrator,
        "extraido_em": extraido_em or datetime.now().isoformat(),
        "resumo": ai_data.get("resumo", ""),
        "main_insight": ai_data.get("main_insight", ""),
        "main_action": ai_data.get("main_action", ""),
        "topicos": ai_data.get("topicos", []),
        "convidados": ai_data.get("convidados", []),
        "tags": ai_data.get("tags", []),
        **campos_extras(ai_data),
    }).eq("id", video_id).execute()


def upsert_episode(video_id: str, podcast_id: str, metadata: dict, ai_data: dict, transcript: str = None, extrator: str = None) -> str:
    """
    Insere ou atualiza um episódio no banco.

    Args:
        video_id: ID do vídeo do YouTube
        podcast_id: UUID do podcast no banco
        metadata: Dados do YouTube (titulo, data, duracao, thumbnail)
        ai_data: Dados gerados pelo Claude (resumo, main_insight, etc.)
        transcript: Transcrição bruta (raw layer)

    Returns:
        ID do episódio inserido
    """
    print(f"💾 Salvando episódio: {metadata['titulo'][:60]}...")

    episode_data = {
        "id": video_id,
        "podcast_id": podcast_id,
        "ep_number": metadata.get("ep_number"),
        "titulo": metadata["titulo"],
        "data": metadata["data"],
        "duracao": metadata["duracao"],
        "thumbnail": metadata["thumbnail"],
        "convidados": ai_data.get("convidados", []),
        "tags": ai_data.get("tags", []),
        "resumo": ai_data.get("resumo", ""),
        "main_insight": ai_data.get("main_insight", ""),
        "main_action": ai_data.get("main_action", ""),
        "topicos": ai_data.get("topicos", []),
        "link_youtube": f"https://www.youtube.com/watch?v={video_id}",
        "status": "done",
        "processed_at": datetime.now().isoformat(),
        "transcricao": transcript,
        "extrator": extrator,
        "extraido_em": datetime.now().isoformat(),
        **campos_extras(ai_data),
    }

    # Upsert: insere se não existe, atualiza se já existe
    supabase.table("episodes").upsert(episode_data).execute()

    print(f"   ✅ Episódio salvo: {video_id}")
    return video_id


def normaliza_autor(autor):
    """Autor ausente vira NULL. O prompt já pede null, mas modelo antigo (ou
    reprocessamento de dado velho) ainda manda "Não especificado" — a UI não
    deve exibir isso como se fosse um nome."""
    if not autor:
        return None
    a = autor.strip()
    if re.match(r"^n[ãa]o\s+(especificado|mencionado|informado|consta)", a, re.I):
        return None
    return a or None


# O schema da extração já restringe, mas a gravação não confia no que vem de fora.
NATUREZAS = {"recomenda", "menciona", "critica"}
MAX_TEMAS = 6


def para_segundos(marcador) -> int | None:
    """"[01:23:45]" -> 5025. Devolve None pra qualquer coisa fora do formato,
    inclusive um timestamp inventado em formato estranho."""
    if not marcador:
        return None
    m = re.search(r"(\d{1,2}):(\d{2}):(\d{2})", str(marcador))
    if not m:
        return None
    h, mi, s = (int(g) for g in m.groups())
    if mi > 59 or s > 59:
        return None
    return h * 3600 + mi * 60 + s


def upsert_livros(
    video_id: str,
    livros: list[dict],
    substituir: bool = False,
    temas_renovados: set | None = None,
) -> int:
    """
    Grava as obras citadas num episódio, com tudo que a extração devolve:
    contexto, fala literal, quem citou, natureza, minuto e temas do livro.

    É o único caminho de gravação de citações — a sync semanal e o
    reprocessamento em lote passam por aqui. Antes eram dois, e a sync
    descartava em silêncio metade dos campos que a chamada tinha pago.

    Args:
        video_id: ID do episódio
        livros: lista de obras como vem da extração
        substituir: apaga as citações antigas do episódio antes de gravar.
            Usado no reprocessamento, onde a extração antiga tem erros que
            precisam sumir (ex.: "Limbic Capitalism", que era o conceito
            discutido e não o título do livro). Livro que ficar sem nenhuma
            citação vira órfão e some do site, que já filtra por contagem.
        temas_renovados: ids de livros cujos temas já foram trocados nesta
            rodada. Passe o mesmo set em todas as chamadas de um
            reprocessamento: na primeira vez que um livro aparece, os temas
            antigos (herdados das tags do EPISÓDIO) são descartados; nas
            seguintes, faz união. Sem isso os temas velhos ocupavam o teto e
            os do livro não entravam.

    Returns:
        Quantidade de obras gravadas
    """
    if substituir:
        supabase.table("episode_livros").delete().eq("episode_id", video_id).execute()

    gravados = 0
    for livro in livros or []:
        titulo = (livro.get("titulo") or "").strip()
        if not titulo:
            continue
        # Sem fala e sem minuto não é citação: é obra que o modelo tirou da
        # descrição do episódio ("autor do livro X"), contra o que o prompt
        # pede. Só vale pra extração nova — a antiga não tinha esses campos.
        if "citacao_literal" in livro and not livro.get("citacao_literal") \
                and not livro.get("timestamp"):
            print(f"   ⏭️ ignorada (sem fala nem minuto): {titulo}")
            continue
        autor = normaliza_autor(livro.get("autor"))
        tipo = livro.get("tipo") or "livro"
        temas_novos = [t.strip() for t in (livro.get("temas") or []) if t and t.strip()]

        # Não dá pra usar upsert com on_conflict aqui: no Postgres dois NULL
        # não colidem, então um livro sem autor criaria uma linha nova a cada
        # episódio que o cita.
        busca = supabase.table("livros").select("id, temas").eq("titulo", titulo)
        busca = busca.is_("autor", "null") if autor is None else busca.eq("autor", autor)
        existente = busca.execute()

        if existente.data:
            livro_id = existente.data[0]["id"]
            temas_atuais = existente.data[0].get("temas") or []
            if temas_renovados is not None and livro_id not in temas_renovados:
                base = []
            else:
                base = temas_atuais
            # O mesmo livro é extraído uma vez por episódio que o cita, e cada
            # extração propõe temas. União com teto, pra convergir em vez de
            # acumular 19 chips.
            uniao = list(dict.fromkeys([*base, *temas_novos]))[:MAX_TEMAS]
            if uniao and uniao != temas_atuais:
                supabase.table("livros").update({"temas": uniao}).eq(
                    "id", livro_id
                ).execute()
        else:
            livro_id = supabase.table("livros").insert({
                "titulo": titulo,
                "autor": autor,
                "tipo": tipo,
                "temas": temas_novos[:MAX_TEMAS],
            }).execute().data[0]["id"]

        if temas_renovados is not None:
            temas_renovados.add(livro_id)

        # O minuto vem da extração (copiado da linha da transcrição). O
        # `timestamp_seg` já calculado só vale como reserva.
        segundos = para_segundos(livro.get("timestamp"))
        if segundos is None:
            segundos = livro.get("timestamp_seg")

        natureza = livro.get("natureza")
        supabase.table("episode_livros").upsert(
            {
                "episode_id": video_id,
                "livro_id": livro_id,
                "contexto": livro.get("contexto"),
                "timestamp_seg": segundos,
                "citacao_literal": livro.get("citacao_literal"),
                "quem_citou": livro.get("quem_citou"),
                "natureza": natureza if natureza in NATUREZAS else None,
            },
            on_conflict="episode_id,livro_id",
        ).execute()
        gravados += 1

    if gravados:
        print(f"   ✅ {gravados} obras vinculadas ao episódio")
    return gravados


def save_episode(video_id: str, podcast_id: str, metadata: dict, ai_data: dict, transcript: str = None, extrator: str = None):
    """
    Função principal: salva episódio + livros no banco.
    Combina upsert_episode + upsert_livros.
    """
    upsert_episode(video_id, podcast_id, metadata, ai_data, transcript, extrator)
    upsert_livros(video_id, ai_data.get("livros", []))
    print(f"🎉 Episódio {video_id} salvo com sucesso no banco!")


# ─── Teste direto ───
if __name__ == "__main__":
    # Dados de teste (simulando output do Extract + Transform)
    test_metadata = {
        "titulo": "TESTE: Episódio de Teste",
        "data": "2026-03-17",
        "duracao": "1h30min",
        "thumbnail": "https://example.com/thumb.jpg",
    }

    test_ai_data = {
        "resumo": "Este é um episódio de teste para validar o pipeline de carga.",
        "main_insight": "Testar cada parte isoladamente é essencial para um pipeline robusto.",
        "main_action": "Sempre escreva testes antes de integrar componentes.",
        "topicos": ["Testes", "Pipeline", "Qualidade"],
        "convidados": ["Convidado Teste"],
        "tags": ["Tecnologia", "Testes"],
        "livros": [
            {"titulo": "Clean Code", "autor": "Robert C. Martin"},
            {"titulo": "O Poder do Hábito", "autor": "Charles Duhigg"},
        ],
    }

    PODCAST_ID = "a1b2c3d4-0000-0000-0000-000000000001"

    save_episode("test-video-123", PODCAST_ID, test_metadata, test_ai_data)
