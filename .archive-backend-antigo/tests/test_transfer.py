"""Envio de pontos entre clientes inscritos (P2P)."""

from __future__ import annotations

from app.extensions import db
from app.models import Wallet
from .conftest import auth_headers


def _balance(user_id: str) -> int:
    db.session.expire_all()
    return db.session.query(Wallet).filter_by(user_id=user_id).one().balance_pts


def test_envio_basico_por_email(client, mariana, lucas):
    assert _balance(mariana.id) == 10_000
    assert _balance(lucas.id) == 1_000

    r = client.post("/transfer/", json={
        "to": "lucas@blaxx.com",
        "amount_pts": 2_000,
        "password": "123456",
        "message": "obrigado!",
    }, headers=auth_headers(mariana))
    assert r.status_code == 201, r.json
    assert r.json["receipt_code"].startswith("ENV-")

    assert _balance(mariana.id) == 8_000
    assert _balance(lucas.id) == 3_000


def test_envio_por_cpf(client, mariana, lucas):
    r = client.post("/transfer/", json={
        "to": "987.654.321-00",  # com máscara
        "amount_pts": 500,
        "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 201, r.json
    assert _balance(lucas.id) == 1_500


def test_senha_errada_rejeita(client, mariana, lucas):
    r = client.post("/transfer/", json={
        "to": "lucas@blaxx.com", "amount_pts": 100, "password": "wrong",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400
    assert "senha" in r.json["error"].lower()
    assert _balance(mariana.id) == 10_000


def test_saldo_insuficiente(client, mariana, lucas):
    r = client.post("/transfer/", json={
        "to": "lucas@blaxx.com", "amount_pts": 999_999, "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400
    assert _balance(mariana.id) == 10_000
    assert _balance(lucas.id) == 1_000


def test_nao_envia_para_si_mesmo(client, mariana):
    r = client.post("/transfer/", json={
        "to": "mariana@blaxx.com", "amount_pts": 100, "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400


def test_minimo_e_limite(client, mariana, lucas):
    # mínimo 100 pts
    r = client.post("/transfer/", json={
        "to": "lucas@blaxx.com", "amount_pts": 50, "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400


def test_destinatario_nao_existe(client, mariana):
    r = client.post("/transfer/", json={
        "to": "fantasma@blaxx.com", "amount_pts": 200, "password": "123456",
    }, headers=auth_headers(mariana))
    assert r.status_code == 400
