"""Fixtures para testes de auth — DB SQLite in-memory por teste."""
import os
import sys

# Ajusta path para importar `app` quando rodando via `pytest backend/tests/`
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

# Aponta env vars para um ambiente de teste isolado ANTES de criar o app
os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("FLASK_ENV", "development")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:8000")
os.environ.setdefault("SECRET_KEY", "test-secret")
# Rate-limit por IP alto o suficiente pra nao afetar suites longas; o teste
# especifico de rate-limit valida o limite por email (hardcoded em auth.py).
os.environ.setdefault("LOGIN_RATE_LIMIT_PER_IP", "10000")

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.services import rate_limit as _rate_limit  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Cada teste comeca com o bucket em memoria limpo."""
    _rate_limit._buckets.clear()


@pytest.fixture
def app():
    app = create_app()
    app.config["TESTING"] = True
    with app.app_context():
        db.drop_all()
        db.create_all()
    yield app


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def register_payload():
    return {
        "name": "Maria Teste",
        "email": "maria@teste.com",
        "password": "SuperSecret1!",
        "password_confirm": "SuperSecret1!",
        "accept_terms": True,
        "accept_privacy": True,
        "marketing_optin": True,
    }
