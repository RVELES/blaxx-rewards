"""Entrypoint local. Use: `python run.py` (depois `python seed.py`).

host=0.0.0.0 permite acessar do celular na mesma Wi-Fi (alem do PC).
Para restringir so ao PC, defina BLAXX_HOST=127.0.0.1.
"""

import os
import socket

from app import create_app

app = create_app()


def _local_ip() -> str:
    """Descobre o IP da maquina na rede local (sem chamar nada)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # nao envia, so escolhe interface
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    host = os.environ.get("BLAXX_HOST", "0.0.0.0")
    port = int(os.environ.get("BLAXX_PORT", "5001"))
    if host == "0.0.0.0":
        ip = _local_ip()
        print()
        print("=" * 64)
        print(f"  Blaxx Pontos rodando")
        print(f"  Neste PC:        http://127.0.0.1:{port}/site/")
        print(f"  Outros aparelhos: http://{ip}:{port}/site/")
        print(f"  (no celular, abra a 2a URL no Safari/Chrome)")
        print("=" * 64)
        print()
    app.run(host=host, port=port, debug=True)
