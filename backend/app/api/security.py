"""Endpoints do modulo de seguranca: telefone, MFA SMS, historico de acessos.

Separado de user.py pra manter logica de auth/MFA isolada e facilitar a
review de seguranca.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import secrets

from flask import Blueprint, current_app

from ..extensions import db
from ..models import AuthAuditLog, MfaChallenge, PhoneOtp, User
from ..services import sms as sms_service
from ..services.audit import Event, log_event
from ..services.rate_limit import cooldown_check
from ..services.tokens import expires_in, hash_token, utcnow
from ._helpers import (
    client_ip,
    client_ua,
    current_user,
    err,
    get_json,
    ok,
    require_auth,
)

bp = Blueprint("security", __name__)

# ----------------------------------------------------------------------
# Validacao de telefone E.164 (BR-first mas aceita +cc internacional)
# ----------------------------------------------------------------------
_PHONE_RE = re.compile(r"^\+\d{8,15}$")


def normalize_phone(raw: str | None) -> str:
    """Aceita '(11) 99999-9999' OU '11999999999' e converte para '+5511999999999'.
    Se ja vier com '+', preserva.
    """
    if not raw:
        return ""
    s = re.sub(r"[^\d+]", "", str(raw))
    if not s:
        return ""
    if s.startswith("+"):
        return s if _PHONE_RE.match(s) else ""
    # Sem +: assume Brasil (55) se tiver DDD+numero
    if len(s) == 11 or len(s) == 10:
        s = "+55" + s
    elif len(s) == 13 and s.startswith("55"):
        s = "+" + s
    else:
        s = "+" + s
    return s if _PHONE_RE.match(s) else ""


def mask_phone(phone: str | None) -> str:
    if not phone:
        return ""
    s = str(phone)
    if len(s) < 4:
        return "***"
    return s[:3] + "*" * (len(s) - 7) + s[-4:]


def _generate_code() -> str:
    """OTP numerico de 6 digitos. crypto-rand."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _issue_phone_otp(user: User, phone: str, purpose: str) -> str:
    cfg = current_app.config["_CONFIG"]
    # Invalida OTPs anteriores do mesmo proposito pra mesma conta
    db.session.execute(
        db.update(PhoneOtp)
        .where(
            PhoneOtp.user_id == user.id,
            PhoneOtp.purpose == purpose,
            PhoneOtp.used_at.is_(None),
        )
        .values(used_at=utcnow())
    )
    code = _generate_code()
    db.session.add(
        PhoneOtp(
            user_id=user.id,
            phone=phone,
            code_hash=hash_token(code),
            purpose=purpose,
            expires_at=expires_in(cfg.PHONE_OTP_TTL),
        )
    )
    db.session.commit()
    return code


# ----------------------------------------------------------------------
# POST /user/phone — cadastra/troca telefone + envia OTP
# ----------------------------------------------------------------------
@bp.post("/phone")
@require_auth
def request_phone():
    cfg = current_app.config["_CONFIG"]
    data = get_json()
    user = current_user()

    raw = data.get("phone")
    phone = normalize_phone(raw)
    if not phone:
        return err("Telefone invalido. Use formato (11) 99999-9999 ou +5511999999999",
                   400, error_code="invalid_phone")

    can, retry = cooldown_check(
        f"phone_otp:user:{user.id}", cfg.PHONE_OTP_COOLDOWN
    )
    if not can:
        return err("Aguarde antes de pedir novo codigo",
                   429, error_code="cooldown", extra={"retry_in": retry})

    # Salva como pendente (phone setado mas phone_verified=False ate confirmar)
    user.phone = phone
    user.phone_verified = False
    db.session.commit()

    code = _issue_phone_otp(user, phone, "verify_phone")
    sms_service.send_otp(phone, code, "verify_phone")
    log_event(Event.PHONE_OTP_SENT, user_id=user.id, metadata={"purpose": "verify_phone"})

    return ok({
        "message": "Enviamos um codigo de 6 digitos por SMS",
        "phone_masked": mask_phone(phone),
    })


# ----------------------------------------------------------------------
# POST /user/phone/verify — valida codigo
# ----------------------------------------------------------------------
@bp.post("/phone/verify")
@require_auth
def verify_phone():
    data = get_json()
    user = current_user()
    code = (data.get("code") or "").strip()

    if not re.match(r"^\d{6}$", code):
        return err("Codigo invalido", 400, error_code="invalid_code")

    record = db.session.scalar(
        db.select(PhoneOtp).where(
            PhoneOtp.user_id == user.id,
            PhoneOtp.purpose == "verify_phone",
            PhoneOtp.used_at.is_(None),
        ).order_by(PhoneOtp.id.desc())
    )
    if not record:
        return err("Nenhum codigo pendente. Solicite um novo.",
                   400, error_code="no_pending_code")

    record.attempts += 1
    db.session.commit()

    if not record.is_valid():
        return err("Codigo expirado ou bloqueado por tentativas",
                   400, error_code="code_expired")
    if record.code_hash != hash_token(code):
        return err("Codigo nao confere", 400, error_code="wrong_code")

    record.used_at = utcnow()
    user.phone = record.phone
    user.phone_verified = True
    db.session.commit()

    log_event(Event.PHONE_VERIFIED, user_id=user.id)
    return ok({
        "message": "Telefone verificado",
        "user": user.to_safe_dict(),
    })


# ----------------------------------------------------------------------
# DELETE /user/phone — remove telefone (desativa MFA se ativo)
# ----------------------------------------------------------------------
@bp.delete("/phone")
@require_auth
def remove_phone():
    data = get_json()
    user = current_user()
    password = data.get("password") or ""

    if not user.has_password() or not user.check_password(password):
        return err("Senha incorreta", 400, error_code="wrong_password")

    user.phone = None
    user.phone_verified = False
    if user.mfa_enabled and user.mfa_method == "sms":
        user.mfa_enabled = False
        user.mfa_method = None
        log_event(Event.MFA_DISABLED, user_id=user.id, metadata={"reason": "phone_removed"})
    db.session.commit()

    log_event(Event.PHONE_REMOVED, user_id=user.id)
    return ok({"user": user.to_safe_dict()})


# ----------------------------------------------------------------------
# POST /user/2fa/sms/enable — exige phone_verified + re-confirmacao do codigo
# ----------------------------------------------------------------------
@bp.post("/2fa/sms/enable")
@require_auth
def enable_2fa_sms():
    user = current_user()
    if not user.phone_verified or not user.phone:
        return err("Verifique seu telefone antes de ativar 2FA",
                   400, error_code="phone_not_verified")
    if user.mfa_enabled and user.mfa_method == "sms":
        return ok({"message": "2FA SMS ja estava ativo", "user": user.to_safe_dict()})

    user.mfa_enabled = True
    user.mfa_method = "sms"
    db.session.commit()
    log_event(Event.MFA_ENABLED, user_id=user.id, metadata={"method": "sms"})
    sms_service.send_security_alert(user.phone, "2FA por SMS foi ativada")
    return ok({"message": "2FA por SMS ativada", "user": user.to_safe_dict()})


# ----------------------------------------------------------------------
# POST /user/2fa/sms/disable — exige senha
# ----------------------------------------------------------------------
@bp.post("/2fa/sms/disable")
@require_auth
def disable_2fa_sms():
    data = get_json()
    user = current_user()
    password = data.get("password") or ""
    if not user.has_password() or not user.check_password(password):
        return err("Senha incorreta", 400, error_code="wrong_password")
    if not user.mfa_enabled:
        return ok({"message": "2FA ja estava desativada", "user": user.to_safe_dict()})

    user.mfa_enabled = False
    user.mfa_method = None
    db.session.commit()
    log_event(Event.MFA_DISABLED, user_id=user.id)
    if user.phone:
        sms_service.send_security_alert(user.phone, "2FA por SMS foi desativada")
    return ok({"message": "2FA desativada", "user": user.to_safe_dict()})


# ----------------------------------------------------------------------
# GET /user/access-log — historico de tentativas/logins
# ----------------------------------------------------------------------
@bp.get("/access-log")
@require_auth
def access_log():
    user = current_user()
    limit = min(int((get_json().get("limit") if False else 50)), 200)

    # Mostra eventos relevantes pro usuario (login + mudancas sensiveis)
    relevant_events = [
        Event.LOGIN_SUCCESS,
        Event.LOGIN_FAIL,
        Event.LOGIN_BLOCKED,
        Event.LOGOUT,
        Event.LOGOUT_ALL,
        Event.PASSWORD_CHANGED,
        Event.RESET_PASSWORD_SUCCESS,
        Event.MFA_ENABLED,
        Event.MFA_DISABLED,
        Event.MFA_CHALLENGE_SUCCESS,
        Event.MFA_CHALLENGE_FAIL,
        Event.PHONE_VERIFIED,
        Event.PHONE_REMOVED,
        Event.EMAIL_CHANGED,
    ]
    rows = db.session.scalars(
        db.select(AuthAuditLog)
        .where(
            AuthAuditLog.user_id == user.id,
            AuthAuditLog.event_type.in_(relevant_events),
        )
        .order_by(AuthAuditLog.created_at.desc())
        .limit(limit)
    ).all()

    return ok({
        "items": [
            {
                "event": r.event_type,
                "ip": _mask_ip(r.ip_address),
                "user_agent": r.user_agent,
                "device": _device_from_ua(r.user_agent),
                "metadata": json.loads(r.metadata_json) if r.metadata_json else None,
                "at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    })


def _mask_ip(ip: str | None) -> str:
    if not ip:
        return ""
    # IPv4: mascara ultimos 2 octetos. IPv6: mostra prefixo + ***.
    parts = ip.split(".")
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.***.***"
    if ":" in ip:
        head = ip.split(":")[0]
        return f"{head}::***"
    return "***"


def _device_from_ua(ua: str | None) -> str:
    if not ua:
        return "Desconhecido"
    u = ua.lower()
    os_ = "Desconhecido"
    if "iphone" in u: os_ = "iPhone"
    elif "ipad" in u: os_ = "iPad"
    elif "android" in u: os_ = "Android"
    elif "mac os" in u or "macintosh" in u: os_ = "Mac"
    elif "windows" in u: os_ = "Windows"
    elif "linux" in u: os_ = "Linux"
    browser = "Desconhecido"
    if "edg/" in u: browser = "Edge"
    elif "chrome/" in u: browser = "Chrome"
    elif "firefox/" in u: browser = "Firefox"
    elif "safari/" in u: browser = "Safari"
    return f"{os_} · {browser}"
