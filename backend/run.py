"""Entry point para rodar o servidor Flask localmente.

Uso:
    python run.py            # servidor dev na porta 5000
    PORT=8080 python run.py  # porta customizada

Em producao use gunicorn:
    gunicorn -w 2 -b 0.0.0.0:8000 'app:create_app()'
"""
import os
from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
