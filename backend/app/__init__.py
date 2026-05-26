"""Application factory."""
from __future__ import annotations

import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS

from .config import load_config
from .extensions import db


def create_app() -> Flask:
    load_dotenv()

    # Em dev, servimos os HTMLs estaticos diretamente do Flask para simplificar.
    # Aponte FRONTEND_DIR para a pasta blaxx/ (default: ../).
    frontend_dir = os.environ.get(
        "FRONTEND_DIR",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
    )

    app = Flask(__name__, static_folder=frontend_dir, static_url_path="")
    cfg = load_config()
    app.config.from_object(cfg)
    app.config["_CONFIG"] = cfg

    logging.basicConfig(
        level=logging.INFO if cfg.FLASK_ENV != "development" else logging.DEBUG,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    os.makedirs(os.path.join(app.root_path, "..", "instance"), exist_ok=True)

    db.init_app(app)
    CORS(
        app,
        origins=list(cfg.CORS_ORIGINS),
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    )

    from .api.auth import bp as auth_bp
    from .api.security import bp as security_bp
    from .api.user import bp as user_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(user_bp, url_prefix="/user")
    # security tem rotas que se misturam com /user/* (phone, 2fa) e /user/access-log,
    # mantemos prefix /user pra coerencia com initSeguranca/perfil.
    app.register_blueprint(security_bp, url_prefix="/user")

    @app.get("/health")
    def health():
        return jsonify(service="blaxx-pontos-backend", status="ok")

    @app.get("/")
    def index_html():
        return app.send_static_file("index.html")

    @app.errorhandler(404)
    def not_found(_e):
        return jsonify(error="not_found"), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return jsonify(error="method_not_allowed"), 405

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("erro interno: %s", e)
        return jsonify(error="internal_error"), 500

    @app.after_request
    def security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        resp.headers.setdefault(
            "Permissions-Policy",
            "geolocation=(), microphone=(), camera=(), payment=()",
        )
        if cfg.FLASK_ENV != "development":
            resp.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=31536000; includeSubDomains",
            )
        return resp

    with app.app_context():
        from . import models  # noqa: F401 — registra os modelos antes do create_all

        db.create_all()
        _apply_lightweight_migrations()

    return app


def _apply_lightweight_migrations() -> None:
    """Adiciona colunas ao SQLite quando o DB foi criado em versao anterior.

    Para mudancas mais complexas (drop column, rename, type change), trocar
    por Alembic. Aqui so cobrimos ADD COLUMN nullable, que SQLite aceita
    direto via ALTER TABLE.
    """
    import logging

    log = logging.getLogger(__name__)
    bind = db.engine
    if not bind.url.drivername.startswith("sqlite"):
        # Em postgres/outro DB usar Alembic; aqui silencia.
        return

    # (table, column, ddl)
    pending = [
        ("users", "phone", "VARCHAR(20)"),
        ("users", "phone_verified", "BOOLEAN NOT NULL DEFAULT 0"),
        ("users", "mfa_enabled", "BOOLEAN NOT NULL DEFAULT 0"),
        ("users", "mfa_method", "VARCHAR(16)"),
    ]
    with bind.begin() as conn:
        for table, col, ddl in pending:
            res = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
            existing = {row[1] for row in res}
            if col not in existing:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                log.info("migration: added %s.%s", table, col)
