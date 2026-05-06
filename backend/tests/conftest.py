"""Fixtures comuns: app de teste em SQLite in-memory + 2 usuários seedados."""

from __future__ import annotations

import pytest

from app import create_app
from app.config import TestConfig
from app.extensions import db
from app.models import TxType, User, Wallet
from app.services import wallet as wallet_svc


@pytest.fixture()
def app():
    app = create_app(config=TestConfig)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


def _make_user(email: str, cpf: str, name: str, password: str = "123456",
               initial: int = 0, pix_key: str | None = None) -> User:
    u = User(name=name, email=email, cpf=cpf, pix_key=pix_key or email)
    u.set_password(password)
    db.session.add(u)
    db.session.flush()
    db.session.add(Wallet(user_id=u.id))
    db.session.flush()
    if initial:
        wallet_svc.credit(
            user_id=u.id, amount_pts=initial, tx_type=TxType.BONUS,
            description="seed",
        )
    db.session.commit()
    return u


@pytest.fixture()
def mariana(app):
    return _make_user("mariana@blaxx.com", "12345678900", "Mariana Costa",
                      initial=10_000)


@pytest.fixture()
def lucas(app):
    return _make_user("lucas@blaxx.com", "98765432100", "Lucas Andrade",
                      initial=1_000)


def auth_headers(user) -> dict:
    return {"Authorization": f"Bearer {user.id}"}
