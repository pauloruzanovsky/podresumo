# Republicar o Painel Podlibris

Painel: https://claude.ai/artifact/N51qkMrsGWiZ4ejZs1f7Qm (página HTML privada, do Paulo).
Seguido pela rotina `podlibris-painel` (todo dia às 4h) e no fim das rotinas
de domingo (`podlibris-lote-semanal`) e de segunda (`podlibris-newsletter-semanal`).
Não gasta API da Anthropic, não muda o banco, não pede deploy e não envia nada.

Diretório de trabalho: `C:\Users\Paulo\Desktop\Atalhos\CLAUDE COWORK\PROJECTS\podresumo\pipeline`.
Se um passo falhar, siga com os outros e diga qual falhou no relatório.

1. **Rotinas do app** (só o app sabe quando rodaram). Com `list_scheduled_tasks`
   e, pra cada uma das quatro abaixo, `list_task_runs` com `limit: 1`, grave
   `respostas\rotinas-painel.json` (UTF-8) assim:

   ```json
   [{"id": "podresumo-baixar-transcricoes", "nome": "Baixar transcrições", "quando": "todo dia às 8h e 20h",
     "ultima": "<lastRunAt>", "proxima": "<nextRunAt>", "status": "<status da última execução>", "resumo": "<summary dela, ou null>"},
    {"id": "podlibris-lote-semanal", "nome": "Extração semanal", "quando": "domingo às 21h", ...},
    {"id": "podlibris-newsletter-semanal", "nome": "Coleta e newsletter", "quando": "segunda às 9h", ...},
    {"id": "podlibris-painel", "nome": "Painel", "quando": "todo dia às 4h", ...}]
   ```

   Sem `lastRunAt`, `"ultima": null`. Se as ferramentas não estiverem
   disponíveis, pule: o painel mostra as rotinas do app como "não conferido".

2. **Gerar a página:** `.venv\Scripts\python.exe -m flows.painel` (timeout de
   10 minutos). Grava `respostas\painel.html` (o modelo `painel\modelo.html`
   com os dados embutidos) e imprime o título e os alertas.

3. **Publicar:** `Artifact` com `action: "read"` e a `url` do painel; depois
   `Artifact` publish com a mesma `url` e `file_path` no caminho absoluto de
   `respostas\painel.html`. Sem `icon`. Não mexa em mais nada.

4. No relatório, uma linha: painel atualizado (ou o passo que falhou), o
   título que o `flows.painel` imprimiu e os alertas.
