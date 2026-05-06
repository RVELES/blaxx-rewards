@echo off
cd /d "%~dp0"
echo.
echo === Blaxx Pontos backend ===
echo.

echo [Verificando Python...]
where python >nul 2>nul || (echo Python nao encontrado. Instale em https://www.python.org & pause & exit /b 1)
python --version
echo.

echo [Instalando dependencias - idempotente, pode demorar na 1a vez...]
python -m pip install -q -r requirements.txt
echo.

echo [Criando usuarios demo - idempotente...]
python seed.py
echo.

echo [Subindo servidor em http://127.0.0.1:5001 e na rede local...]
echo Para parar: feche esta janela ou Ctrl+C.
echo --------------------------------------------------------------
echo.
python run.py

echo.
echo --------------------------------------------------------------
echo Servidor terminou. Veja a mensagem acima.
pause
