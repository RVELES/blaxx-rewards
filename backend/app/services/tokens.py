"""Geracao e validacao de tokens opacos para verificacao de email, reset de senha
e sessoes. Sempre armazenamos *hash* (SHA-256) do token, nunca o token em claro.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import secrets


def generate_token(nbytes: int = 32) -> str:
    """Token URL-safe (base64). 32 bytes = ~43 chars. Use o valor retornado em links/emails."""
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    """SHA-256 hex digest. Determinístico — útil para procurar no DB."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def utcnow() -> dt.datetime:
    """UTC *naive* — compativel com colunas DateTime do SQLite/SQLAlchemy."""
    return dt.datetime.utcnow()


def expires_in(seconds: int) -> dt.datetime:
    return utcnow() + dt.timedelta(seconds=seconds)
