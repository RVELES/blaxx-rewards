"""Helpers compartilhados entre as APIs: validacao, auth middleware, respostas padrao."""
from __future__ import annotations

import re
from functools import wraps
from typing import Any, Callable

from flask import g, jsonify, request

from ..models import AuthSession, User
from ..services.session import find_session

# ----------------------------------------------------------------------
# Respostas
# ----------------------------------------------------------------------
def err(message: str, code: int = 400, *, error_code: str | None = None, extra: dict | None = None):
    body: dict[str, Any] = {"error": message}
    if error_code:
        body["code"] = error_code
    if extra:
        body.update(extra)
    return jsonify(body), code


def ok(payload: dict | None = None, code: int = 200):
    return jsonify(payload or {"ok": True}), code


# ----------------------------------------------------------------------
# Validacao
# ----------------------------------------------------------------------
EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
# Senha: 8+ chars, ao menos 1 maiuscula, 1 minuscula, 1 digito, 1 especial
PASSWORD_RE = re.compile(
    r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\w\s]).{8,128}$"
)
NAME_RE = re.compile(r"^[\w\sÀ-ÿ'\-\.]{2,120}$", re.UNICODE)


def normalize_email(value: str | None) -> str:
    return (value or "").strip().lower()


def is_valid_email(value: str | None) -> bool:
    if not value or len(value) > 255:
        return False
    return bool(EMAIL_RE.match(value))


def is_strong_password(value: str | None) -> bool:
    if not value:
        return False
    return bool(PASSWORD_RE.match(value))


def is_valid_name(value: str | None) -> bool:
    if not value:
        return False
    v = value.strip()
    return bool(NAME_RE.match(v)) and len(v.split()) >= 2  # exige nome + sobrenome


def get_json() -> dict:
    """Le body JSON tolerante (request.get_json silent). Retorna {} se invalido."""
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


# ----------------------------------------------------------------------
# Auth middleware
# ----------------------------------------------------------------------
def _extract_token() -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


def require_auth(fn: Callable) -> Callable:
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not token:
            return err("Nao autenticado", 401, error_code="unauthorized")
        sess = find_session(token)
        if not sess:
            return err("Sessao invalida ou expirada", 401, error_code="invalid_session")
        user: User | None = sess.user
        if not user or not user.is_active():
            return err("Conta inativa", 401, error_code="account_inactive")
        g.current_user = user
        g.current_session = sess
        return fn(*args, **kwargs)

    return wrapper


def current_user() -> User:
    return g.current_user


def current_session() -> AuthSession:
    return g.current_session


# ----------------------------------------------------------------------
# Client IP / UA helpers
# ----------------------------------------------------------------------
def client_ip() -> str:
    fwd = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return (fwd or request.remote_addr or "") or ""


def client_ua() -> str:
    return (request.headers.get("User-Agent") or "")[:500]
