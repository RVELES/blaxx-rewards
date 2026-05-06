"""Resgate de pontos via PIX (payout)."""

from __future__ import annotations

from app.extensions import db
from app.models import PixPayout, PixPayoutStatus, Wallet
from .conftest import auth_headers


def _balance(user_id: str) -> int:
    db.session.expire_all()
    return db.session.query(Wallet).filter_by(user_id=user_id).one().balance_pts


def test_quote(client, mariana):
    r = client.get("/redeem/quote?points=5000", headers=auth_headers(mariana))
    assert r.status_code == 200
    assert r.json["amount_brl"] == 50.0


def test_resgate_sucesso_credita_pix(client, mariana):
    assert _balance(mariana.id) == 10_000

    r = client.post("/redeem/", json={
        "points": 5_000,
        "pix_key": "ricardo.veles@gmail.com",
        "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 201, r.json
    body = r.json
    assert body["status"] == "paid"
    assert body["amount_brl"] == 50.0
    assert body["end_to_end_id"].startswith("E")
    assert _balance(mariana.id) == 5_000


def test_resgate_falha_estorna_pontos(client, mariana):
    """Chave PIX começando com 'fail-' faz o mock provider falhar.
    O serviço deve estornar os pontos automaticamente."""
    r = client.post("/redeem/", json={
        "points": 3_000,
        "pix_key": "fail-bad-key@blaxx.com",
        "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 201, r.json
    assert r.json["status"] == "failed"
    # Saldo voltou ao original
    assert _balance(mariana.id) == 10_000


def test_resgate_abaixo_minimo(client, mariana):
    r = client.post("/redeem/", json={
        "points": 1_000, "pix_key": "x@y.com", "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400


def test_resgate_nao_multiplo(client, mariana):
    # 100 pts = R$ 1, então valor precisa ser múltiplo de 100
    r = client.post("/redeem/", json={
        "points": 2_550, "pix_key": "x@y.com", "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400


def test_resgate_senha_errada(client, mariana):
    r = client.post("/redeem/", json={
        "points": 5_000, "pix_key": "x@y.com", "password": "wrong",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400
    assert _balance(mariana.id) == 10_000


def test_resgate_saldo_insuficiente(client, lucas):
    # Lucas tem 1.000 pts, mas mínimo é 2.500 — primeiro bate no mínimo
    r = client.post("/redeem/", json={
        "points": 2_500, "pix_key": "x@y.com", "password": "123456",
    }, headers=auth_headers(lucas))
    assert r.status_code == 400  # saldo insuficiente
    assert _balance(lucas.id) == 1_000
