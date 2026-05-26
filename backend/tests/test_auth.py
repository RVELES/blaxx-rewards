"""Testes basicos do fluxo de autenticacao."""
from __future__ import annotations

import datetime as dt
import hashlib

import pytest

from app.extensions import db
from app.models import EmailVerificationToken, PasswordResetToken, User
from app.services.tokens import hash_token


# ----------------------------------------------------------------------
# Cadastro
# ----------------------------------------------------------------------
def test_register_valid(client, register_payload):
    r = client.post("/auth/register", json=register_payload)
    assert r.status_code == 201
    assert r.json["user"]["email"] == "maria@teste.com"
    assert r.json["user"]["email_verified"] is False
    assert r.json["user"]["status"] == "pending_verification"


def test_register_weak_password(client, register_payload):
    register_payload["password"] = "abc"
    register_payload["password_confirm"] = "abc"
    r = client.post("/auth/register", json=register_payload)
    assert r.status_code == 400
    assert r.json["code"] == "weak_password"


def test_register_duplicate_email(client, register_payload):
    client.post("/auth/register", json=register_payload)
    r = client.post("/auth/register", json=register_payload)
    assert r.status_code == 409
    assert r.json["code"] == "email_exists"


def test_register_password_mismatch(client, register_payload):
    register_payload["password_confirm"] = "SuperSecret2!"
    r = client.post("/auth/register", json=register_payload)
    assert r.status_code == 400
    assert r.json["code"] == "password_mismatch"


def test_register_missing_terms(client, register_payload):
    register_payload["accept_terms"] = False
    r = client.post("/auth/register", json=register_payload)
    assert r.status_code == 400
    assert r.json["code"] == "terms_not_accepted"


def test_register_invalid_name(client, register_payload):
    register_payload["name"] = "Maria"  # sem sobrenome
    r = client.post("/auth/register", json=register_payload)
    assert r.status_code == 400
    assert r.json["code"] == "invalid_name"


# ----------------------------------------------------------------------
# Login
# ----------------------------------------------------------------------
def _register_and_verify(client, app, payload):
    """Helper: registra + busca token + marca verificado direto no DB."""
    client.post("/auth/register", json=payload)
    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.email == payload["email"]))
        user.email_verified = True
        user.status = "active"
        db.session.commit()
        return user.id


def test_login_blocked_when_email_not_verified(client, register_payload):
    client.post("/auth/register", json=register_payload)
    r = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert r.status_code == 403
    assert r.json["code"] == "email_not_verified"


def test_login_valid(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    r = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    )
    assert r.status_code == 200
    assert "token" in r.json
    assert r.json["user"]["email"] == register_payload["email"]


def test_login_wrong_password(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    r = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": "OutraSenha9$"},
    )
    assert r.status_code == 401
    assert r.json["code"] == "invalid_credentials"


def test_login_unknown_email(client):
    r = client.post(
        "/auth/login", json={"email": "nao-existe@teste.com", "password": "X1!aBcDe"}
    )
    assert r.status_code == 401
    assert r.json["code"] == "invalid_credentials"


# ----------------------------------------------------------------------
# /me e autenticacao via Bearer
# ----------------------------------------------------------------------
def test_me_unauthenticated(client):
    r = client.get("/auth/me")
    assert r.status_code == 401


def test_me_with_token(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    login = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    ).json
    r = client.get("/auth/me", headers={"Authorization": "Bearer " + login["token"]})
    assert r.status_code == 200
    assert r.json["user"]["email"] == register_payload["email"]


def test_logout_invalidates_session(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    login = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    ).json
    headers = {"Authorization": "Bearer " + login["token"]}
    assert client.post("/auth/logout", headers=headers).status_code == 200
    # token deve estar invalido apos logout
    assert client.get("/auth/me", headers=headers).status_code == 401


# ----------------------------------------------------------------------
# Verify email
# ----------------------------------------------------------------------
def test_verify_email_valid(client, app, register_payload):
    client.post("/auth/register", json=register_payload)
    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.email == register_payload["email"]))
        token_record = db.session.scalar(
            db.select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
        )
        assert token_record is not None
        # Para o teste, fabricamos um token com hash conhecido
        plain = "test-known-token-1234567890abcdef"
        token_record.token_hash = hash_token(plain)
        db.session.commit()

    r = client.post("/auth/verify-email", json={"token": plain})
    assert r.status_code == 200
    assert r.json["user"]["email_verified"] is True
    assert r.json["user"]["status"] == "active"


def test_verify_email_invalid_token(client):
    r = client.post("/auth/verify-email", json={"token": "nao-existe"})
    assert r.status_code == 400
    assert r.json["code"] == "invalid_token"


def test_verify_email_expired(client, app, register_payload):
    client.post("/auth/register", json=register_payload)
    plain = "expired-token-xyz"
    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.email == register_payload["email"]))
        token_record = db.session.scalar(
            db.select(EmailVerificationToken).where(EmailVerificationToken.user_id == user.id)
        )
        token_record.token_hash = hash_token(plain)
        token_record.expires_at = dt.datetime.utcnow() - dt.timedelta(hours=1)
        db.session.commit()

    r = client.post("/auth/verify-email", json={"token": plain})
    assert r.status_code == 400
    assert r.json["code"] == "token_expired"


# ----------------------------------------------------------------------
# Forgot/reset password
# ----------------------------------------------------------------------
def test_forgot_password_always_generic(client):
    # Email nao existe — ainda retorna sucesso generico
    r = client.post("/auth/forgot-password", json={"email": "nao-existe@teste.com"})
    assert r.status_code == 200
    assert "instrucoes" in r.json["message"].lower()


def test_reset_password_valid(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    client.post("/auth/forgot-password", json={"email": register_payload["email"]})
    plain = "reset-token-known-1234"
    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.email == register_payload["email"]))
        token_record = db.session.scalar(
            db.select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        token_record.token_hash = hash_token(plain)
        db.session.commit()

    new_password = "NovaSenhaForte9#"
    r = client.post(
        "/auth/reset-password",
        json={"token": plain, "password": new_password, "password_confirm": new_password},
    )
    assert r.status_code == 200

    # Login com senha velha falha; com nova funciona
    assert (
        client.post(
            "/auth/login",
            json={"email": register_payload["email"], "password": register_payload["password"]},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login",
            json={"email": register_payload["email"], "password": new_password},
        ).status_code
        == 200
    )


def test_reset_password_expired_token(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    client.post("/auth/forgot-password", json={"email": register_payload["email"]})
    plain = "reset-expired"
    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.email == register_payload["email"]))
        token_record = db.session.scalar(
            db.select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        token_record.token_hash = hash_token(plain)
        token_record.expires_at = dt.datetime.utcnow() - dt.timedelta(minutes=10)
        db.session.commit()

    r = client.post(
        "/auth/reset-password",
        json={"token": plain, "password": "Outra9$Senha", "password_confirm": "Outra9$Senha"},
    )
    assert r.status_code == 400
    assert r.json["code"] == "token_expired"


def test_reset_password_invalidates_sessions(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    # cria sessao
    login = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    ).json
    headers = {"Authorization": "Bearer " + login["token"]}
    assert client.get("/auth/me", headers=headers).status_code == 200

    # gera token reset com hash conhecido
    client.post("/auth/forgot-password", json={"email": register_payload["email"]})
    plain = "reset-rev-sessions"
    with app.app_context():
        user = db.session.scalar(db.select(User).where(User.email == register_payload["email"]))
        token_record = db.session.scalar(
            db.select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        token_record.token_hash = hash_token(plain)
        db.session.commit()

    new_password = "ReViradaForte4$"
    client.post(
        "/auth/reset-password",
        json={"token": plain, "password": new_password, "password_confirm": new_password},
    )
    # sessao antiga deve estar revogada
    assert client.get("/auth/me", headers=headers).status_code == 401


# ----------------------------------------------------------------------
# Update password (logado)
# ----------------------------------------------------------------------
def test_update_password_wrong_current(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    login = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    ).json
    headers = {"Authorization": "Bearer " + login["token"]}
    r = client.patch(
        "/user/password",
        headers=headers,
        json={
            "current_password": "ErradaTotal9$",
            "new_password": "NovaSenha9#",
            "new_password_confirm": "NovaSenha9#",
        },
    )
    assert r.status_code == 400
    assert r.json["code"] == "wrong_password"


def test_update_password_success_revokes_sessions(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    login = client.post(
        "/auth/login",
        json={"email": register_payload["email"], "password": register_payload["password"]},
    ).json
    headers = {"Authorization": "Bearer " + login["token"]}
    new_password = "TrocaForte4#"
    r = client.patch(
        "/user/password",
        headers=headers,
        json={
            "current_password": register_payload["password"],
            "new_password": new_password,
            "new_password_confirm": new_password,
        },
    )
    assert r.status_code == 200
    # sessao antiga revogada
    assert client.get("/auth/me", headers=headers).status_code == 401
    # nova senha funciona
    assert (
        client.post(
            "/auth/login",
            json={"email": register_payload["email"], "password": new_password},
        ).status_code
        == 200
    )


# ----------------------------------------------------------------------
# Rate limit
# ----------------------------------------------------------------------
def test_login_rate_limit_per_email(client, app, register_payload):
    _register_and_verify(client, app, register_payload)
    # Limite por email = 10 (hardcoded em auth.py). Faz 11 tentativas
    # erradas: a 11a deve bater rate limit.
    for _ in range(11):
        r = client.post(
            "/auth/login",
            json={"email": register_payload["email"], "password": "Errada9$Senha"},
        )
    assert r.status_code == 429
    assert r.json["code"] == "rate_limited"
