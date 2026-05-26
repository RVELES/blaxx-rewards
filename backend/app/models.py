"""Modelos de dominio.

Inclui modelos para Fase 2 (AccountProvider, AuthSession completa) ja prontos para
evitar migracoes posteriores. F1 usa apenas o subconjunto necessario.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

import bcrypt
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


def utcnow() -> dt.datetime:
    """UTC *naive* — SQLite nao preserva timezone; manter consistente evita
    bugs de 'can't compare offset-naive and offset-aware datetimes'.
    """
    return dt.datetime.utcnow()


# ----------------------------------------------------------------------
# User
# ----------------------------------------------------------------------
class User(db.Model):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # ciclo de vida
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # federacao (Google etc) — F2 usa AccountProvider; mantemos campos diretos por conveniencia
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="local")
    google_sub: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, unique=True, index=True
    )

    # LGPD / marketing
    accepted_terms_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    marketing_optin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # auditoria de cadastro
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )
    last_login_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    created_ip: Mapped[Optional[str]] = mapped_column(String(64))
    created_user_agent: Mapped[Optional[str]] = mapped_column(String(500))

    # relacionamentos
    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    providers: Mapped[list["AccountProvider"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )

    # -------- helpers --------
    def set_password(self, plain: str) -> None:
        if not plain:
            raise ValueError("senha vazia")
        self.password_hash = bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()

    def check_password(self, plain: str) -> bool:
        if not self.password_hash:
            return False
        try:
            return bcrypt.checkpw(plain.encode("utf-8"), self.password_hash.encode())
        except (ValueError, TypeError):
            return False

    def has_password(self) -> bool:
        return bool(self.password_hash)

    def is_active(self) -> bool:
        return self.status == "active" and self.deleted_at is None

    def to_safe_dict(self) -> dict:
        """Apenas campos seguros para retornar ao cliente."""
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "avatar_url": self.avatar_url,
            "provider": self.provider,
            "email_verified": self.email_verified,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login_at": self.last_login_at.isoformat() if self.last_login_at else None,
        }


# ----------------------------------------------------------------------
# AuthSession — uma linha por dispositivo conectado
# ----------------------------------------------------------------------
class AuthSession(db.Model):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    refresh_token_hash: Mapped[Optional[str]] = mapped_column(String(128), unique=True, index=True)

    device_name: Mapped[Optional[str]] = mapped_column(String(120))
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))

    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    last_used_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="sessions")

    def is_valid(self) -> bool:
        return self.revoked_at is None and self.expires_at > utcnow()


# ----------------------------------------------------------------------
# Tokens de email-verification e password-reset
# ----------------------------------------------------------------------
class EmailVerificationToken(db.Model):
    __tablename__ = "email_verification_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)

    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    # quando o token e para um *novo* email (fluxo trocar email), armazenamos aqui
    target_email: Mapped[Optional[str]] = mapped_column(String(255))

    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > utcnow()


class PasswordResetToken(db.Model):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)

    expires_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > utcnow()


# ----------------------------------------------------------------------
# Auditoria
# ----------------------------------------------------------------------
class AuthAuditLog(db.Model):
    __tablename__ = "auth_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    event_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    metadata_json: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, index=True
    )


# ----------------------------------------------------------------------
# Federacao — F2
# ----------------------------------------------------------------------
class AccountProvider(db.Model):
    __tablename__ = "account_providers"
    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_provider_account"),
        Index("ix_provider_user", "user_id", "provider"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_user_id: Mapped[str] = mapped_column(String(128), nullable=False)
    provider_email: Mapped[Optional[str]] = mapped_column(String(255))
    linked_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    unlinked_at: Mapped[Optional[dt.datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="providers")
