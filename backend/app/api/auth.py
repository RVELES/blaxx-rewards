"""Endpoints de autenticacao: register, login, logout, me, verify, reset, etc."""
from __future__ import annotations

import datetime as dt

from flask import Blueprint, current_app, jsonify

from ..extensions import db
from ..models import (
    EmailVerificationToken,
    PasswordResetToken,
    User,
)
from ..services import email as email_service
from ..services.audit import Event, log_event
from ..services.rate_limit import cooldown_check, hit
from ..services.session import (
    create_session,
    revoke_all_sessions,
    revoke_session,
)
from ..services.tokens import expires_in, generate_token, hash_token, utcnow
from ._helpers import (
    client_ip,
    client_ua,
    current_session,
    current_user,
    err,
    get_json,
    is_strong_password,
    is_valid_email,
    is_valid_name,
    normalize_email,
    ok,
    require_auth,
)

bp = Blueprint("auth", __name__)


# ----------------------------------------------------------------------
# Helpers internos
# ----------------------------------------------------------------------
def _verification_link(token: str) -> str:
    base = current_app.config["_CONFIG"].APP_URL.rstrip("/")
    return f"{base}/validacao.html?token={token}"


def _reset_link(token: str) -> str:
    base = current_app.config["_CONFIG"].APP_URL.rstrip("/")
    return f"{base}/redefinir-senha.html?token={token}"


def _issue_verification_token(user: User, target_email: str | None = None) -> str:
    """Gera token, salva hash e retorna o token em claro para envio por email."""
    cfg = current_app.config["_CONFIG"]
    token = generate_token(32)
    db.session.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_token(token),
            target_email=target_email,
            expires_at=expires_in(cfg.EMAIL_VERIFICATION_TOKEN_TTL),
        )
    )
    db.session.commit()
    return token


def _issue_password_reset_token(user: User) -> str:
    cfg = current_app.config["_CONFIG"]
    token = generate_token(32)
    db.session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=expires_in(cfg.PASSWORD_RESET_TOKEN_TTL),
        )
    )
    db.session.commit()
    return token


# ----------------------------------------------------------------------
# POST /auth/register
# ----------------------------------------------------------------------
@bp.post("/register")
def register():
    data = get_json()
    name = (data.get("name") or "").strip()
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""
    confirm = data.get("password_confirm") or data.get("confirm") or ""
    accept_terms = bool(data.get("accept_terms"))
    accept_privacy = bool(data.get("accept_privacy"))
    marketing_optin = bool(data.get("marketing_optin"))

    if not is_valid_name(name):
        return err("Informe nome completo (nome e sobrenome)", 400, error_code="invalid_name")
    if not is_valid_email(email):
        return err("Email invalido", 400, error_code="invalid_email")
    if not is_strong_password(password):
        return err(
            "Senha fraca: minimo 8 caracteres, com maiuscula, minuscula, numero e simbolo",
            400,
            error_code="weak_password",
        )
    if password != confirm:
        return err("Senhas nao conferem", 400, error_code="password_mismatch")
    if not (accept_terms and accept_privacy):
        return err(
            "E necessario aceitar Termos de Uso e Politica de Privacidade",
            400,
            error_code="terms_not_accepted",
        )

    existing = db.session.scalar(db.select(User).where(User.email == email))
    if existing:
        # Mesmo conflito retorna 409 — eh o padrao REST e nao expoe info adicional
        # alem da que o usuario ja sabe (que esta tentando se cadastrar).
        log_event(Event.REGISTER_DUP_EMAIL, metadata={"email": email})
        return err("Email ja cadastrado", 409, error_code="email_exists")

    user = User(
        name=name,
        email=email,
        provider="local",
        status="pending_verification",
        accepted_terms_at=utcnow(),
        marketing_optin=marketing_optin,
        created_ip=client_ip()[:64] or None,
        created_user_agent=client_ua(),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    token = _issue_verification_token(user)
    email_service.send_verification_email(user.email, user.name, _verification_link(token))
    log_event(Event.REGISTER, user_id=user.id)

    return ok(
        {
            "user": user.to_safe_dict(),
            "message": "Conta criada. Verifique seu email para ativar.",
        },
        code=201,
    )


# ----------------------------------------------------------------------
# POST /auth/login
# ----------------------------------------------------------------------
@bp.post("/login")
def login():
    cfg = current_app.config["_CONFIG"]
    data = get_json()
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""

    # Rate limit por IP — generico, evita brute force massivo
    allowed, retry = hit(
        f"login:{client_ip()}",
        cfg.LOGIN_RATE_LIMIT_PER_IP,
        cfg.LOGIN_RATE_LIMIT_WINDOW,
    )
    if not allowed:
        log_event(Event.RATE_LIMITED, metadata={"endpoint": "login", "scope": "ip"})
        return err(
            "Muitas tentativas. Tente novamente em alguns minutos.",
            429,
            error_code="rate_limited",
            extra={"retry_in": retry},
        )

    # Rate limit por email (mais restritivo) — protege conta especifica
    if email:
        allowed_email, retry_email = hit(
            f"login:email:{email}", 10, cfg.LOGIN_RATE_LIMIT_WINDOW
        )
        if not allowed_email:
            log_event(Event.RATE_LIMITED, metadata={"endpoint": "login", "scope": "email"})
            return err(
                "Muitas tentativas para esta conta. Tente em instantes.",
                429,
                error_code="rate_limited",
                extra={"retry_in": retry_email},
            )

    user = db.session.scalar(db.select(User).where(User.email == email))
    if not user or not user.check_password(password):
        log_event(
            Event.LOGIN_FAIL,
            user_id=user.id if user else None,
            metadata={"reason": "invalid_credentials", "email": email},
        )
        return err("Credenciais invalidas", 401, error_code="invalid_credentials")

    if user.deleted_at is not None:
        log_event(Event.LOGIN_BLOCKED, user_id=user.id, metadata={"reason": "deleted"})
        return err("Conta inativa", 403, error_code="account_inactive")

    if not user.email_verified or user.status == "pending_verification":
        log_event(Event.LOGIN_BLOCKED, user_id=user.id, metadata={"reason": "email_not_verified"})
        return err(
            "Confirme seu email para entrar. Reenviamos um link se necessario.",
            403,
            error_code="email_not_verified",
        )

    if user.status != "active":
        log_event(Event.LOGIN_BLOCKED, user_id=user.id, metadata={"reason": "inactive"})
        return err("Conta inativa", 403, error_code="account_inactive")

    sess, token = create_session(user, cfg.SESSION_TTL)
    log_event(Event.LOGIN_SUCCESS, user_id=user.id)

    return ok({"user": user.to_safe_dict(), "token": token, "session_id": sess.id})


# ----------------------------------------------------------------------
# POST /auth/logout
# ----------------------------------------------------------------------
@bp.post("/logout")
@require_auth
def logout():
    sess = current_session()
    revoke_session(sess)
    log_event(Event.LOGOUT, user_id=current_user().id)
    return ok()


# ----------------------------------------------------------------------
# POST /auth/logout-all — encerra todas sessoes do usuario
# ----------------------------------------------------------------------
@bp.post("/logout-all")
@require_auth
def logout_all():
    user = current_user()
    revoked = revoke_all_sessions(user.id)
    log_event(Event.LOGOUT_ALL, user_id=user.id, metadata={"revoked": revoked})
    return ok({"revoked": revoked})


# ----------------------------------------------------------------------
# GET /auth/me
# ----------------------------------------------------------------------
@bp.get("/me")
@require_auth
def me():
    return ok({"user": current_user().to_safe_dict()})


# ----------------------------------------------------------------------
# POST /auth/verify-email
# ----------------------------------------------------------------------
@bp.post("/verify-email")
def verify_email():
    data = get_json()
    token = (data.get("token") or "").strip()
    if not token:
        return err("Token nao informado", 400, error_code="missing_token")

    record = db.session.scalar(
        db.select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_token(token)
        )
    )
    if not record:
        log_event(Event.VERIFY_EMAIL_FAIL, metadata={"reason": "not_found"})
        return err("Token invalido", 400, error_code="invalid_token")
    if record.used_at:
        log_event(Event.VERIFY_EMAIL_FAIL, user_id=record.user_id, metadata={"reason": "used"})
        return err("Token ja utilizado", 400, error_code="token_used")
    if not record.is_valid():
        log_event(Event.VERIFY_EMAIL_FAIL, user_id=record.user_id, metadata={"reason": "expired"})
        return err("Token expirado", 400, error_code="token_expired")

    user = db.session.get(User, record.user_id)
    if not user:
        return err("Conta nao encontrada", 404, error_code="user_not_found")

    # Se foi token para troca de email (target_email setado), aplica troca
    if record.target_email:
        user.email = record.target_email
    user.email_verified = True
    if user.status == "pending_verification":
        user.status = "active"
    record.used_at = utcnow()
    db.session.commit()

    log_event(Event.VERIFY_EMAIL_SUCCESS, user_id=user.id)
    return ok({"user": user.to_safe_dict()})


# ----------------------------------------------------------------------
# POST /auth/resend-verification
# ----------------------------------------------------------------------
@bp.post("/resend-verification")
def resend_verification():
    cfg = current_app.config["_CONFIG"]
    data = get_json()
    email = normalize_email(data.get("email"))
    if not is_valid_email(email):
        return err("Email invalido", 400, error_code="invalid_email")

    # Cooldown por email para evitar abuso
    can, retry = cooldown_check(
        f"resend_verification:{email}", cfg.RESEND_VERIFICATION_COOLDOWN
    )
    if not can:
        return err(
            "Aguarde antes de tentar novamente",
            429,
            error_code="cooldown",
            extra={"retry_in": retry},
        )

    user = db.session.scalar(db.select(User).where(User.email == email))
    # Sempre 200 para nao revelar existencia de conta
    if user and not user.email_verified:
        token = _issue_verification_token(user)
        email_service.send_verification_email(user.email, user.name, _verification_link(token))
        log_event(Event.RESEND_VERIFICATION, user_id=user.id)

    return ok({"message": "Se a conta precisar de verificacao, enviaremos novo link."})


# ----------------------------------------------------------------------
# POST /auth/forgot-password
# ----------------------------------------------------------------------
@bp.post("/forgot-password")
def forgot_password():
    data = get_json()
    email = normalize_email(data.get("email"))
    if not is_valid_email(email):
        # Mesmo erro de validacao retorna mensagem generica — nao reveal exist.
        return ok({"message": "Se este email existir, enviaremos instrucoes."})

    user = db.session.scalar(db.select(User).where(User.email == email))
    if user and user.is_active() and user.has_password():
        token = _issue_password_reset_token(user)
        email_service.send_password_reset_email(user.email, user.name, _reset_link(token))
        log_event(Event.FORGOT_PASSWORD_REQUEST, user_id=user.id)

    return ok({"message": "Se este email existir, enviaremos instrucoes."})


# ----------------------------------------------------------------------
# POST /auth/reset-password
# ----------------------------------------------------------------------
@bp.post("/reset-password")
def reset_password():
    data = get_json()
    token = (data.get("token") or "").strip()
    password = data.get("password") or ""
    confirm = data.get("password_confirm") or data.get("confirm") or ""

    if not token:
        return err("Token nao informado", 400, error_code="missing_token")
    if not is_strong_password(password):
        return err(
            "Senha fraca: minimo 8 caracteres, com maiuscula, minuscula, numero e simbolo",
            400,
            error_code="weak_password",
        )
    if password != confirm:
        return err("Senhas nao conferem", 400, error_code="password_mismatch")

    record = db.session.scalar(
        db.select(PasswordResetToken).where(
            PasswordResetToken.token_hash == hash_token(token)
        )
    )
    if not record:
        log_event(Event.RESET_PASSWORD_FAIL, metadata={"reason": "not_found"})
        return err("Token invalido", 400, error_code="invalid_token")
    if record.used_at:
        log_event(Event.RESET_PASSWORD_FAIL, user_id=record.user_id, metadata={"reason": "used"})
        return err("Token ja utilizado", 400, error_code="token_used")
    if not record.is_valid():
        log_event(Event.RESET_PASSWORD_FAIL, user_id=record.user_id, metadata={"reason": "expired"})
        return err("Token expirado", 400, error_code="token_expired")

    user = db.session.get(User, record.user_id)
    if not user:
        return err("Conta nao encontrada", 404, error_code="user_not_found")

    user.set_password(password)
    record.used_at = utcnow()
    revoked = revoke_all_sessions(user.id)
    db.session.commit()

    log_event(Event.RESET_PASSWORD_SUCCESS, user_id=user.id, metadata={"sessions_revoked": revoked})
    email_service.send_password_changed_email(user.email, user.name)

    return ok({"message": "Senha redefinida. Faca login novamente."})
