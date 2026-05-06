@echo off
REM Sobe um tunel publico HTTPS para o servidor Flask local via ngrok.
REM Pre-requisito:
REM   1) iniciar-servidor.bat ja rodando (porta 5001)
REM   2) ngrok.exe baixado de https://ngrok.com/download
REM      e colocado nesta mesma pasta OU no PATH do Windows
REM   3) Token configurado: ngrok config add-authtoken SEU_TOKEN

cd /d "%~dp0"

echo.
echo === Tunel publico ngrok para o Blaxx ===
echo.

REM Procura ngrok local primeiro, depois no PATH
set NGROK=ngrok
if exist "ngrok.exe" set NGROK=.\ngrok.exe

%NGROK% --version >nul 2>nul || (
    echo ngrok nao encontrado.
    echo.
    echo Baixe em: https://ngrok.com/download
    echo Coloque ngrok.exe nesta mesma pasta ou no PATH.
    echo.
    echo Depois cadastre seu token gratuito em:
    echo   https://dashboard.ngrok.com/get-started/your-authtoken
    echo E rode no PowerShell:
    echo   .\ngrok.exe config add-authtoken SEU_TOKEN
    pause
    exit /b 1
)

echo Subindo tunel para http://localhost:5001 ...
echo Quando aparecer "Forwarding https://...", copie a URL HTTPS e abra no celular.
echo Adicione /site/login.html ao final da URL.
echo Para parar: feche esta janela ou Ctrl+C.
echo --------------------------------------------------------------
echo.

%NGROK% http 5001
