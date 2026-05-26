"""Testes do modulo de seguranca: telefone, MFA SMS, access log."""
from __future__ import annotations

import datetime as dt

import pytest

from app.extensions import db
from app.models import MfaChallenge, PhoneOtp, User
from app.services.tokens import hash_token


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------
def _login(client, payload):
    return client.post("/auth/login", json={
        "email": payload["email"], "password": payload["password"]
    })


def _register_verify_login(client, app, register_payload):
    """Cria conta, marca email verificado, faz login. Retorna (user_id, token, auth_headers)."""
    client.post("/auth/register", json=register_payload)
    with app.app_context():
        user = db.session.scalar(
            db.select(User).where(User.email == register_payload["email"])
        )
        user.email_verified = True
        user.status = "active"
        db.session.commit()
        user_id = user.id
    r = _login(client, register_payload)
    assert r.status_code == 200
    token = r.json["token"]
    return user_id, token, {"Authorization": "Bearer " + token}


def _seed_phone_otp(app, user_id: int, plain_code: str, purpose: str = "verify_phone",
                    phone: str = "+5511987654321", attempts: int = 0):
    with app.app_context():
        # Invalida OTPs anteriores
        db.session.execute(
            db.update(PhoneOtp)
            .where(PhoneOtp.user_id == user_id, PhoneOtp.purpose == purpose,
                   PhoneOtp.used_at.is_(None))
            .values(used_at=dt.datetime.utcnow())
        )
        otp = PhoneOtp(
            user_id=user_id, phone=phone, code_hash=hash_token(plain_code),
            purpose=purpose, attempts=attempts,
            expires_at=dt.datetime.utcnow() + dt.timedelta(minutes=10),
        )
        db.session.add(otp)
        db.session.commit()


# ----------------------------------------------------------------------
# /user/phone
# ----------------------------------------------------------------------
def test_request_phone_invalid_format(client, app, register_payload):
    _, _, h = _register_verify_login(client, app, register_payload)
    r = client.post("/user/phone", headers=h, json={"phone": "abc"})
    assert r.status_code == 400
    assert r.json["code"] == "invalid_phone"


def test_request_phone_ok(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    r = client.post("/user/phone", headers=h, json={"phone": "(11) 98765-4321"})
    assert r.status_code == 200
    assert r.json["phone_masked"].endswith("4321")
    with app.app_context():
        user = db.session.get(User, uid)
        assert user.phone == "+5511987654321"
        assert user.phone_verified is False
        otp = db.session.scalar(
            db.select(PhoneOtp).where(PhoneOtp.user_id == uid,
                                      PhoneOtp.purpose == "verify_phone")
        )
        assert otp is not None
        assert otp.used_at is None


def test_request_phone_cooldown(client, app, register_payload):
    _, _, h = _register_verify_login(client, app, register_payload)
    r1 = client.post("/user/phone", headers=h, json={"phone": "+5511987654321"})
    assert r1.status_code == 200
    r2 = client.post("/user/phone", headers=h, json={"phone": "+5511987654321"})
    assert r2.status_code == 429
    assert r2.json["code"] == "cooldown"


def test_verify_phone_ok(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    client.post("/user/phone", headers=h, json={"phone": "+5511987654321"})
    _seed_phone_otp(app, uid, "654321", purpose="verify_phone",
                    phone="+5511987654321")
    r = client.post("/user/phone/verify", headers=h, json={"code": "654321"})
    assert r.status_code == 200
    assert r.json["user"]["status"] == "active"
    with app.app_context():
        u = db.session.get(User, uid)
        assert u.phone_verified is True


def test_verify_phone_wrong_code(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    client.post("/user/phone", headers=h, json={"phone": "+5511987654321"})
    _seed_phone_otp(app, uid, "111111")
    r = client.post("/user/phone/verify", headers=h, json={"code": "999999"})
    assert r.status_code == 400
    assert r.json["code"] == "wrong_code"


def test_verify_phone_expired(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    client.post("/user/phone", headers=h, json={"phone": "+5511987654321"})
    # Insere com expires_at no passado
    with app.app_context():
        db.session.execute(
            db.update(PhoneOtp).where(PhoneOtp.user_id == uid).values(used_at=dt.datetime.utcnow())
        )
        otp = PhoneOtp(
            user_id=uid, phone="+5511987654321", code_hash=hash_token("123456"),
            purpose="verify_phone",
            expires_at=dt.datetime.utcnow() - dt.timedelta(minutes=1),
        )
        db.session.add(otp); db.session.commit()
    r = client.post("/user/phone/verify", headers=h, json={"code": "123456"})
    assert r.status_code == 400
    assert r.json["code"] == "code_expired"


def test_verify_phone_attempts_blocks(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    client.post("/user/phone", headers=h, json={"phone": "+5511987654321"})
    _seed_phone_otp(app, uid, "111111", attempts=5)  # ja excedeu
    r = client.post("/user/phone/verify", headers=h, json={"code": "111111"})
    assert r.status_code == 400
    assert r.json["code"] == "code_expired"


def test_remove_phone(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    # Seta telefone + verifica direto via DB
    with app.app_context():
        u = db.session.get(User, uid)
        u.phone = "+5511987654321"
        u.phone_verified = True
        u.mfa_enabled = True
        u.mfa_method = "sms"
        db.session.commit()

    # Senha errada
    r1 = client.delete("/user/phone", headers=h, json={"password": "ErradaTotal!"})
    assert r1.status_code == 400

    # Senha certa
    r2 = client.delete("/user/phone", headers=h, json={"password": register_payload["password"]})
    assert r2.status_code == 200
    with app.app_context():
        u = db.session.get(User, uid)
        assert u.phone is None
        assert u.phone_verified is False
        assert u.mfa_enabled is False
        assert u.mfa_method is None


# ----------------------------------------------------------------------
# /user/2fa/sms/*
# ----------------------------------------------------------------------
def test_enable_2fa_blocked_without_phone_verified(client, app, register_payload):
    _, _, h = _register_verify_login(client, app, register_payload)
    r = client.post("/user/2fa/sms/enable", headers=h, json={})
    assert r.status_code == 400
    assert r.json["code"] == "phone_not_verified"


def test_enable_disable_2fa(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    with app.app_context():
        u = db.session.get(User, uid)
        u.phone = "+5511987654321"
        u.phone_verified = True
        db.session.commit()

    r1 = client.post("/user/2fa/sms/enable", headers=h, json={})
    assert r1.status_code == 200
    with app.app_context():
        u = db.session.get(User, uid)
        assert u.mfa_enabled is True
        assert u.mfa_method == "sms"

    # Disable exige senha
    r_bad = client.post("/user/2fa/sms/disable", headers=h, json={"password": "errada"})
    assert r_bad.status_code == 400
    r2 = client.post("/user/2fa/sms/disable", headers=h,
                     json={"password": register_payload["password"]})
    assert r2.status_code == 200
    with app.app_context():
        u = db.session.get(User, uid)
        assert u.mfa_enabled is False


# ----------------------------------------------------------------------
# Login com 2FA ativo
# ----------------------------------------------------------------------
def _setup_user_with_mfa(client, app, register_payload):
    uid, _, h = _register_verify_login(client, app, register_payload)
    with app.app_context():
        u = db.session.get(User, uid)
        u.phone = "+5511987654321"
        u.phone_verified = True
        u.mfa_enabled = True
        u.mfa_method = "sms"
        db.session.commit()
    return uid


def test_login_with_2fa_active_returns_challenge(client, app, register_payload):
    _setup_user_with_mfa(client, app, register_payload)
    r = _login(client, register_payload)
    assert r.status_code == 200
    assert r.json.get("mfa_required") is True
    assert "mfa_challenge_token" in r.json
    assert r.json["mfa_phone_hint"].endswith("4321")
    assert "token" not in r.json  # nao emite sessao


def test_login_2fa_complete_flow(client, app, register_payload):
    uid = _setup_user_with_mfa(client, app, register_payload)
    r_login = _login(client, register_payload)
    challenge_token = r_login.json["mfa_challenge_token"]

    # Pega o OTP que o backend criou e re-injeta com hash conhecido
    known_code = "098765"
    with app.app_context():
        challenge = db.session.scalar(
            db.select(MfaChallenge).where(
                MfaChallenge.challenge_token_hash == hash_token(challenge_token)
            )
        )
        assert challenge is not None
        otp = db.session.get(PhoneOtp, challenge.phone_otp_id)
        otp.code_hash = hash_token(known_code)
        db.session.commit()

    r2 = client.post("/auth/login/2fa", json={
        "challenge_token": challenge_token, "code": known_code
    })
    assert r2.status_code == 200
    assert "token" in r2.json
    assert r2.json["user"]["id"] == uid

    # Token recebido funciona
    r3 = client.get("/auth/me", headers={"Authorization": "Bearer " + r2.json["token"]})
    assert r3.status_code == 200


def test_login_2fa_wrong_code(client, app, register_payload):
    _setup_user_with_mfa(client, app, register_payload)
    r_login = _login(client, register_payload)
    r2 = client.post("/auth/login/2fa", json={
        "challenge_token": r_login.json["mfa_challenge_token"],
        "code": "000000",
    })
    assert r2.status_code == 400
    assert r2.json["code"] == "wrong_code"


def test_login_2fa_invalid_challenge_token(client):
    r = client.post("/auth/login/2fa", json={
        "challenge_token": "fake-token", "code": "123456"
    })
    assert r.status_code == 400
    assert r.json["code"] == "challenge_expired"


def test_login_2fa_challenge_expired(client, app, register_payload):
    _setup_user_with_mfa(client, app, register_payload)
    r_login = _login(client, register_payload)
    challenge_token = r_login.json["mfa_challenge_token"]
    # Expira manualmente
    with app.app_context():
        challenge = db.session.scalar(
            db.select(MfaChallenge).where(
                MfaChallenge.challenge_token_hash == hash_token(challenge_token)
            )
        )
        challenge.expires_at = dt.datetime.utcnow() - dt.timedelta(minutes=1)
        db.session.commit()
    r2 = client.post("/auth/login/2fa", json={
        "challenge_token": challenge_token, "code": "111111"
    })
    assert r2.status_code == 400
    assert r2.json["code"] == "challenge_expired"


# ----------------------------------------------------------------------
# Access log
# ----------------------------------------------------------------------
def test_access_log_returns_login_events(client, app, register_payload):
    _, _, h = _register_verify_login(client, app, register_payload)
    # Faz mais um login pra ter 2 eventos
    _login(client, register_payload)
    r = client.get("/user/access-log", headers=h)
    assert r.status_code == 200
    events = [it["event"] for it in r.json["items"]]
    assert "auth.login.success" in events


def test_access_log_unauthenticated(client):
    r = client.get("/user/access-log")
    assert r.status_code == 401
