@echo off
REM Blaxx Pontos - testa os 3 fluxos PIX contra o backend Flask local
REM Basta dar duplo-clique neste arquivo (precisa do servidor Flask rodando)

cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0testar-fluxos.ps1"
