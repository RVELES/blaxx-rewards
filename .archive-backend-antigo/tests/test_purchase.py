"""Compra de pontos via PIX (cobrança → webhook → crédito)."""

from __future__ import annotations

from app.extensions import db
from app.models import PixCharge, PixChargeStatus, Wallet
from .conftest import auth_headers


def test_create_charge_and_pay(client, mariana):
    # Saldo inicial
    w = db.session.query(Wallet).filter_by(user_id=mariana.id).one()
    assert w.balance_pts == 10_000

    # 1) Cria charge para o pacote "plus" (R$ 49,90 = 5.500 pts)
    r = client.post("/pix/charge", json={"package": "plus"},
                    headers=auth_headers(mariana))
    assert r.status_code == 201, r.json
    body = r.json
    assert body["status"] == "pending"
    assert body["points_to_credit"] == 5_500
    assert body["amount_brl"] == 49.90
    assert body["br_code"].startswith("0002")
    assert body["br_code"].endswith(_crc_tail := body["br_code"][-4:])  # 4-char CRC
    txid = body["txid"]
    charge_id = body["id"]

    # 2) Provedor manda webhook
    r = client.post("/pix/webhook", json={"txid": txid})
    assert r.status_code == 200, r.json
    assert r.json["charge"]["status"] == "paid"

    # 3) Pontos creditados na carteira
    db.session.expire_all()
    w = db.session.query(Wallet).filter_by(user_id=mariana.id).one()
    assert w.balance_pts == 10_000 + 5_500

    # 4) Webhook duplicado é idempotente — não credita de novo
    r = client.post("/pix/webhook", json={"txid": txid})
    assert r.status_code == 200
    db.session.expire_all()
    w = db.session.query(Wallet).filter_by(user_id=mariana.id).one()
    assert w.balance_pts == 10_000 + 5_500


def test_pacote_invalido(client, mariana):
    r = client.post("/pix/charge", json={"package": "ouro"},
                    headers=auth_headers(mariana))
    assert r.status_code == 400


def test_simulate_payment_endpoint(client, mariana):
    r = client.post("/pix/charge", json={"package": "start"},
                    headers=auth_headers(mariana))
    charge_id = r.json["id"]

    r = client.post("/pix/simulate-payment", json={"charge_id": charge_id},
                    headers=auth_headers(mariana))
    assert r.status_code == 200
    assert r.json["charge"]["status"] == "paid"
