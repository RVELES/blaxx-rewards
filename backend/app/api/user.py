"""Endpoints de gestao do proprio usuario (perfil, senha, email, sessoes)."""
from __future__ import annotations

from flask import Blueprint, current_app

from ..extensions import db
from ..models import AuthSession, User
from ..services import email as email_service
from ..services.audit import Event, log_event
from ..services.session import revoke_all_sessions, revoke_session
from ..services.tokens import utcnow
from ._helpers import (
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

bp = Blueprint("user", __name__)


# ----------------------------------------------------------------------
# PATCH /user/profile
# ----------------------------------------------------------------------
@bp.patch("/profile")
@require_auth
def update_profile():
    data = get_json()
    user = current_user()
    changed: list[str] = []

    if "name" in data:
        name = (data.get("name") or "").strip()
        if not is_valid_name(name):
            return err("Nome invalido", 400, error_code="invalid_name")
        if name != user.name:
            user.name = name
            changed.append("name")

    if "avatar_url" in data:
        url = (data.get("avatar_url") or "").strip() or None
        if url and len(url) > 500:
            return err("URL muito longa", 400, error_code="invalid_avatar")
        if url != user.avatar_url:
            user.avatar_url = url
            changed.append("avatar_url")

    if "marketing_optin" in data:
        new = bool(data.get("marketing_optin"))
        if new != user.marketing_optin:
            user.marketing_optin = new
            changed.append("marketing_optin")

    if changed:
        db.session.commit()
        log_event(Event.PROFILE_UPDATED, user_id=user.id, metadata={"fields": changed})

    return ok({"user": user.to_safe_dict(), "updated": changed})


# ----------------------------------------------------------------------
# PATCH /user/password
# ----------------------------------------------------------------------
@bp.patch("/password")
@require_auth
def update_password():
    data = get_json()
    user = current_user()
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    confirm = data.get("new_password_confirm") or data.get("confirm") or ""

    if not user.has_password():
        return err(
            "Conta sem senha definida — use 'Esqueci minha senha'",
            400,
            error_code="no_password_set",
        )
    if not user.check_password(current):
        log_event(
            Event.PASSWORD_CHANGED,
            user_id=user.id,
            metadata={"result": "wrong_current_password"},
        )
        return err("Senha atual incorreta", 400, error_code="wrong_password")
    if not is_strong_password(new):
        return err(
            "Senha fraca: minimo 8 caracteres, com maiuscula, minuscula, numero e simbolo",
            400,
            error_code="weak_password",
        )
    if new != confirm:
        return err("Confirmacao nao confere", 400, error_code="password_mismatch")
    if user.check_password(new):
        return err("A nova senha precisa ser diferente da atual", 400, error_code="same_password")

    user.set_password(new)
    revoked = revoke_all_sessions(user.id)
    db.session.commit()

    log_event(
        Event.PASSWORD_CHANGED,
        user_id=user.id,
        metadata={"result": "ok", "sessions_revoked": revoked},
    )
    email_service.send_password_changed_email(user.email, user.name)

    return ok({"message": "Senha alterada. Faca login novamente.", "sessions_revoked": revoked})


# ----------------------------------------------------------------------
# PATCH /user/email — exige senha atual + envia confirmacao ao novo email
# ----------------------------------------------------------------------
@bp.patch("/email")
@require_auth
def update_email():
    from .auth import _issue_verification_token, _verification_link  # evita circular

    data = get_json()
    user = current_user()
    new_email = normalize_email(data.get("new_email"))
    password = data.get("current_password") or ""

    if not is_valid_email(new_email):
        return err("Email invalido", 400, error_code="invalid_email")
    if new_email == user.email:
        return err("Email igual ao atual", 400, error_code="same_email")
    if not user.has_password() or not user.check_password(password):
        return err("Senha incorreta", 400, error_code="wrong_password")

    # Verifica conflito
    existing = db.session.scalar(db.select(User).where(User.email == new_email))
    if existing:
        return err("Email ja cadastrado", 409, error_code="email_exists")

    token = _issue_verification_token(user, target_email=new_email)
    email_service.send_email_changed_email(
        to_old=user.email,
        to_new=new_email,
        name=user.name,
        link=_verification_link(token),
    )
    log_event(
        Event.EMAIL_CHANGE_REQUEST,
        user_id=user.id,
        metadata={"old": user.email, "new": new_email},
    )

    return ok({"message": "Enviamos um link de confirmacao ao novo email."})


# ----------------------------------------------------------------------
# GET /user/sessions
# ----------------------------------------------------------------------
@bp.get("/sessions")
@require_auth
def list_sessions():
    user = current_user()
    rows = db.session.scalars(
        db.select(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .order_by(AuthSession.last_used_at.desc())
    ).all()

    from ._helpers import current_session as _cs

    current_id = _cs().id
    return ok(
        {
            "sessions": [
                {
                    "id": s.id,
                    "device_name": s.device_name,
                    "ip_address": s.ip_address,
                    "user_agent": s.user_agent,
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                    "last_used_at": s.last_used_at.isoformat() if s.last_used_at else None,
                    "expires_at": s.expires_at.isoformat() if s.expires_at else None,
                    "current": s.id == current_id,
                }
                for s in rows
            ]
        }
    )


# ----------------------------------------------------------------------
# DELETE /user/sessions/<id>
# ----------------------------------------------------------------------
@bp.delete("/sessions/<int:session_id>")
@require_auth
def kill_session(session_id: int):
    user = current_user()
    sess = db.session.get(AuthSession, session_id)
    if not sess or sess.user_id != user.id:
        return err("Sessao nao encontrada", 404, error_code="session_not_found")
    if sess.revoked_at is not None:
        return ok({"message": "Sessao ja revogada"})
    revoke_session(sess)
    log_event(Event.LOGOUT, user_id=user.id, metadata={"session_id": session_id})
    return ok()
