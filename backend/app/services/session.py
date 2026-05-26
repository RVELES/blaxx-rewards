"""Gestao de AuthSession (sessoes opacas armazenadas no DB).

Fase 1: token opaco unico armazenado como hash. Sem refresh token rotation
(virá na Fase 2). Logout invalida via revoked_at.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from flask import request

from ..extensions import db
from ..models import AuthSession, User
from .tokens import expires_in, generate_token, hash_token, utcnow


def create_session(user: User, ttl_seconds: int) -> tuple[AuthSession, str]:
    """Cria uma nova sessao e retorna (session, token_em_claro). O token volta uma unica vez."""
    token = generate_token(32)
    sess = AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        device_name=_device_name(),
        ip_address=_client_ip(),
        user_agent=(request.headers.get("User-Agent") or "")[:500] if request else None,
        expires_at=expires_in(ttl_seconds),
    )
    db.session.add(sess)
    user.last_login_at = utcnow()
    db.session.commit()
    return sess, token


def find_session(token: str) -> Optional[AuthSession]:
    if not token:
        return None
    sess = db.session.scalar(
        db.select(AuthSession).where(AuthSession.token_hash == hash_token(token))
    )
    if sess and sess.is_valid():
        sess.last_used_at = utcnow()
        db.session.commit()
        return sess
    return None


def revoke_session(sess: AuthSession) -> None:
    sess.revoked_at = utcnow()
    db.session.commit()


def revoke_all_sessions(user_id: int) -> int:
    """Revoga todas as sessoes ativas. Retorna numero de sessoes revogadas."""
    now = utcnow()
    stmt = (
        db.update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    res = db.session.execute(stmt)
    db.session.commit()
    return res.rowcount or 0


def _client_ip() -> str | None:
    if not request:
        return None
    fwd = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return (fwd or request.remote_addr or "")[:64] or None


def _device_name() -> str | None:
    """Heuristica simples a partir do User-Agent."""
    if not request:
        return None
    ua = (request.headers.get("User-Agent") or "").lower()
    if "iphone" in ua:
        return "iPhone"
    if "ipad" in ua:
        return "iPad"
    if "android" in ua:
        return "Android"
    if "macintosh" in ua or "mac os" in ua:
        return "Mac"
    if "windows" in ua:
        return "Windows"
    if "linux" in ua:
        return "Linux"
    return "Web"
