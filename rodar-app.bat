@echo off
rem Sobe o PodResumo localmente e abre no navegador quando o servidor responder.
rem Feche esta janela (ou Ctrl+C) pra parar o servidor.
cd /d "%~dp0web"

if not exist node_modules (
    echo Instalando dependencias...
    call npm install
)

rem Espera o servidor responder (ate 3 min) e so entao abre o navegador.
start "" /b powershell -NoProfile -Command "$u='http://localhost:3000'; for($i=0;$i -lt 90;$i++){ try { Invoke-WebRequest $u -UseBasicParsing -TimeoutSec 5 | Out-Null; Start-Process $u; break } catch { Start-Sleep 2 } }"

call npm run dev
pause
