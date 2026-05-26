@echo off
REM Abre o Chrome em modo iPhone (com DevTools aberto na visao mobile).
REM Pre-requisito: servidor rodando (iniciar-servidor.bat).

set URL=http://127.0.0.1:5001/site/login.html

REM Tamanho da janela ~ iPhone 14 Pro Max + barra DevTools
set FLAGS=--window-size=480,950 --user-data-dir="%TEMP%\blaxx-chrome-iphone" --auto-open-devtools-for-tabs --disable-features=TranslateUI

REM Procura o Chrome em locais padrao
set CHROME=
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe"      set CHROME="%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set CHROME="%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe"      set CHROME="%LocalAppData%\Google\Chrome\Application\chrome.exe"

if "%CHROME%"=="" (
    echo Chrome nao encontrado. Instale em https://www.google.com/chrome/
    pause
    exit /b 1
)

echo.
echo Abrindo Chrome em modo iPhone (janela 480x950).
echo Quando o navegador abrir:
echo   1. Aperte Ctrl+Shift+M para ativar o emulador mobile.
echo   2. No topo, troque "Dimensions" para "iPhone 14 Pro Max".
echo   3. Recarregue (F5).
echo.

start "" %CHROME% %FLAGS% "%URL%"
