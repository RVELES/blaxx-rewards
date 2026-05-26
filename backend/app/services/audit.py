"""Helper para registrar eventos no AuthAuditLog."""
from __future__ import annotations

import json
import logging
from typing import Any

from flask import request

from ..extensions import db
from ..models import AuthAuditLog

log = logging.getLogger(__name__)


# Eventos canonicos — facilita filtragem/metricas
class Event:
    REGISTER = "auth.register"
    REGISTER_DUP_EMAIL = "auth.register.dup_email"
    LOGIN_SUCCESS = "auth.login.success"
    LOGIN_FAIL = "auth.login.fail"
    LOGIN_BLOCKED = "auth.login.blocked"
    LOGOUT = "auth.logout"
    LOGOUT_ALL = "auth.logout.all"
    VERIFY_EMAIL_SUCCESS = "auth.verify_email.success"
    VERIFY_EMAIL_FAIL = "auth.verify_email.fail"
    RESEND_VERIFICATION = "auth.resend_verification"
    FORGOT_PASSWORD_REQUEST = "auth.forgot_password.request"
    RESET_PASSWORD_SUCCESS = "auth.reset_password.success"
    RESET_PASSWORD_FAIL = "auth.reset_password.fail"
    PASSWORD_CHANGED = "user.password.changed"
    PROFILE_UPDATED = "user.profile.updated"
    EMAIL_CHANGE_REQUEST = "user.email.change_request"
    EMAIL_CHANGED = "user.email.changed"
    PHONE_OTP_SENT = "user.phone.otp_sent"
    PHONE_VERIFIED = "user.phone.verified"
    PHONE_REMOVED = "user.phone.removed"
    MFA_ENABLED = "user.mfa.enabled"
    MFA_DISABLED = "user.mfa.disabled"
    MFA_CHALLENGE_ISSUED = "auth.mfa.challenge_issued"
    MFA_CHALLENGE_SUCCESS = "auth.mfa.challenge_success"
    MFA_CHALLENGE_FAIL = "auth.mfa.challenge_fail"
    GOOGLE_LINKED = "auth.google.linked"
    GOOGLE_UNLINKED = "auth.google.unlinked"
    RATE_LIMITED = "auth.rate_limited"


def log_event(
    event_type: str,
    *,
    user_id: int | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    try:
        entry = AuthAuditLog(
            user_id=user_id,
            event_type=event_type,
            ip_address=_client_ip(),
            user_agent=(request.headers.get("User-Agent") or "")[:500] if request else None,
            metadata_json=json.dumps(metadata) if metadata else None,
        )
        db.session.add(entry)
        db.session.commit()
    except Exception:
        # Auditoria nao deve quebrar o fluxo principal
        log.exception("falha ao gravar audit log: %s", event_type)
        db.session.rollback()


def _client_ip() -> str | None:
    if not request:
        return None
    # respeita X-Forwarded-For quando vier de proxy confiavel
    fwd = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return (fwd or request.remote_addr or "")[:64] or None
