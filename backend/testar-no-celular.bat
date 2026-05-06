@echo off
REM Mostra APENAS os IPs locais validos (RFC1918) para acessar do celular.
REM Ignora IPs de VPN, WSL, AWS, e adaptadores virtuais.

setlocal enabledelayedexpansion

echo.
echo ====================================================
echo   IPs locais para abrir no celular (mesma Wi-Fi)
echo ====================================================
echo.

set FOUND=0

REM Le ipconfig e separa por adaptador (linhas em branco entre eles)
for /f "tokens=*" %%L in ('ipconfig') do (
    set "line=%%L"

    REM Detecta inicio de adaptador
    echo !line! | findstr /C:"adaptador" /C:"adapter" >nul && (
        set "current=!line!"
    )

    REM Pega so IPv4
    echo !line! | findstr /C:"IPv4" >nul && (
        for /f "tokens=2 delims=:" %%I in ("!line!") do (
            set "ip=%%I"
            set "ip=!ip: =!"

            REM Filtra so faixas privadas (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
            set "valid=0"
            echo !ip! | findstr /R "^192\.168\." >nul && set "valid=1"
            echo !ip! | findstr /R "^10\."        >nul && set "valid=1"
            echo !ip! | findstr /R "^172\.1[6-9]\." >nul && set "valid=1"
            echo !ip! | findstr /R "^172\.2[0-9]\." >nul && set "valid=1"
            echo !ip! | findstr /R "^172\.3[0-1]\." >nul && set "valid=1"

            REM Ignora WSL (172.x.x.x via vEthernet) - filtra pelo nome
            echo !current! | findstr /I /C:"vEthernet" /C:"WSL" /C:"VirtualBox" /C:"VMware" /C:"Hyper-V" >nul && set "valid=0"

            if "!valid!"=="1" (
                echo   ^>^> Adaptador: !current!
                echo      URL:        http://!ip!:5001/site/login.html
                echo.
                set /a FOUND+=1
            )
        )
    )
)

if %FOUND%==0 (
    echo   NENHUM IP local valido encontrado.
    echo.
    echo   Possiveis causas:
    echo     - PC nao esta conectado na Wi-Fi.
    echo     - VPN ativa esta substituindo o IP local.
    echo.
    echo   Solucoes:
    echo     1. Desligue VPN ^(Cloudflare WARP, NordVPN, etc.^).
    echo     2. Verifique que o Wi-Fi do PC esta conectado.
    echo     3. Veja todos os IPs com:  ipconfig
    echo        e procure manualmente um que comece com 192.168 ou 10.
)

echo ====================================================
echo Passos:
echo   1. Conecte seu celular na MESMA Wi-Fi do PC.
echo   2. Verifique que o servidor esta rodando.
echo   3. Abra a URL acima no Safari ^(iPhone^) ou Chrome ^(Samsung^).
echo   4. Toque em Compartilhar/Menu - "Adicionar a Tela de Inicio".
echo ====================================================
echo.

pause
