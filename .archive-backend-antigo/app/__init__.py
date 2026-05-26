"""Blaxx Pontos — backend Flask.

Módulo que entrega 3 funcionalidades centrais:
  1. Compra de pontos via PIX (cobrança PIX → webhook → crédito)
  2. Envio de pontos entre clientes inscritos (P2P interno)
  3. Resgate de pontos via PIX (payout PIX → débito)

A integração PIX é feita via interface abstrata (`app.pix.provider.PixProvider`)
com implementação mock (`app.pix.mock.MockPixProvider`) — pronta para ser
substituída por um provedor real (Mercado Pago, Asaas, Efí, Stark Bank, etc.)
sem mudar nenhuma regra de negócio.
"""

from __future__ import annotations

import os

from flask import Flask, send_from_directory
from flask_cors import CORS

from .config import Config
from .extensions import db
from .pix.mock import MockPixProvider

# Pasta blaxx/ (raiz do prototipo HTML), 1 nivel acima do backend/
SITE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def create_app(config: type[Config] | None = None, pix_provider=None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config or Config)

    db.init_app(app)

    # CORS - libera o front (Netlify) chamar a API (Fly.io)
    CORS(
        app,
        resources={r"/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )

    # PIX provider — injetável para facilitar testes / troca por provedor real
    app.extensions["pix_provider"] = pix_provider or MockPixProvider()

    # Blueprints
    from .api.auth import bp as auth_bp
    from .api.wallet import bp as wallet_bp
    from .api.pix import bp as pix_bp
    from .api.transfer import bp as transfer_bp
    from .api.redeem import bp as redeem_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(wallet_bp, url_prefix="/wallet")
    app.register_blueprint(pix_bp, url_prefix="/pix")
    app.register_blueprint(transfer_bp, url_prefix="/transfer")
    app.register_blueprint(redeem_bp, url_prefix="/redeem")

    with app.app_context():
        db.create_all()

    @app.get("/health")
    def health():
        return {"status": "ok", "service": "blaxx-pontos-backend"}

    # ----- Servir os HTMLs do prototipo na mesma origem (sem CORS) -----
    @app.get("/site/")
    def site_root():
        return send_from_directory(SITE_DIR, "app.html")

    @app.get("/site/<path:filename>")
    def site_file(filename: str):
        return send_from_directory(SITE_DIR, filename)

    @app.get("/")
    def index():
        """Pagina simples listando os endpoints (so para debug no navegador)."""
        from flask import jsonify
        return jsonify({
            "service": "blaxx-pontos-backend",
            "version": "0.1.0",
            "pix_provider": app.extensions["pix_provider"].name,
            "endpoints": {
                "GET  /health":                "healthcheck",
                "POST /auth/login":            "login (email|cpf + password) -> Bearer token",
                "GET  /auth/me":               "perfil do usuario logado",
                "GET  /wallet/":               "saldo da carteira",
                "GET  /wallet/transactions":   "extrato (parametros: ?limit=N)",
                "GET  /pix/packages":          "pacotes de pontos disponiveis",
                "POST /pix/charge":            "criar cobranca PIX para comprar pontos",
                "GET  /pix/charge/<id>":       "consultar status da cobranca",
                "POST /pix/webhook":           "callback do gateway PIX (publico)",
                "POST /pix/simulate-payment":  "[mock] forcar pagamento de uma charge",
                "POST /transfer/":             "enviar pontos a outro cliente (P2P)",
                "GET  /redeem/quote":          "cotar resgate (parametro: ?points=N)",
                "POST /redeem/":               "solicitar resgate via PIX",
                "GET  /redeem/<id>":           "consultar status do resgate",
            },
            "demo_users": [
                {"email": "mariana@blaxx.com", "password": "123456", "balance_pts": 84750},
                {"email": "lucas@blaxx.com",   "password": "123456", "balance_pts":  5000},
            ],
            "tip": "Para testar todos os fluxos de uma vez, rode 'testar-fluxos.bat'",
        })

    return app
