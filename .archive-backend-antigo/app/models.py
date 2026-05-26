"""Modelos de domínio do Blaxx Pontos.

Convenções:
  * Pontos são INTEIROS (nunca float). Saldo nunca pode ficar negativo.
  * Valores em R$ ficam em centavos (Integer) para evitar erro de ponto flutuante.
  * Cada movimentação de saldo tem 1 Transaction correspondente (ledger imutável).
"""

from __future__ import annotations

import enum
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from werkzeug.security import check_password_hash, generate_password_hash

from .extensions import db


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _new_uuid() -> str:
    return uuid.uuid4().hex


def _new_txid() -> str:
    """txid no padrão Bacen para PIX: [a-zA-Z0-9]{26,35}."""
    return secrets.token_hex(16)  # 32 chars hex


# --------------------------------------------------------------------------- #
# Enums                                                                       #
# --------------------------------------------------------------------------- #
class TxType(str, enum.Enum):
    PURCHASE = "purchase"        # crédito por compra de pontos via PIX
    TRANSFER_OUT = "transfer_out"  # débito ao enviar pontos para outro user
    TRANSFER_IN = "transfer_in"   # crédito ao receber pontos
    REDEEM = "redeem"            # débito por resgate via PIX
    REFUND = "refund"            # estorno (ex.: payout PIX falhou)
    BONUS = "bonus"              # boas-vindas, indicação, etc.


class TxStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REVERSED = "reversed"


class PixChargeStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    EXPIRED = "expired"
    REFUNDED = "refunded"


class PixPayoutStatus(str, enum.Enum):
    REQUESTED = "requested"
    PROCESSING = "processing"
    PAID = "paid"
    FAILED = "failed"


# --------------------------------------------------------------------------- #
# User + Wallet                                                               #
# --------------------------------------------------------------------------- #
class User(db.Model):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_uuid)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(180), unique=True, nullable=False)
    cpf: Mapped[str] = mapped_column(String(14), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    pix_key: Mapped[str | None] = mapped_column(String(180), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    wallet: Mapped["Wallet"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )

    def set_password(self, raw: str) -> None:
        self.password_hash = generate_password_hash(raw)

    def check_password(self, raw: str) -> bool:
        return check_password_hash(self.password_hash, raw)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "cpf": self.cpf,
            "pix_key": self.pix_key,
        }


class Wallet(db.Model):
    __tablename__ = "wallets"
    __table_args__ = (
        CheckConstraint("balance_pts >= 0", name="ck_wallet_balance_nonneg"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    balance_pts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    pending_pts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    user: Mapped[User] = relationship(back_populates="wallet")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="wallet", cascade="all, delete-orphan",
        order_by="Transaction.created_at.desc()",
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "balance_pts": self.balance_pts,
            "pending_pts": self.pending_pts,
            "balance_brl_equiv": round(self.balance_pts / 100, 2),
        }


# --------------------------------------------------------------------------- #
# Ledger                                                                      #
# --------------------------------------------------------------------------- #
class Transaction(db.Model):
    """Ledger: cada movimentação de saldo gera 1 linha imutável."""

    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_uuid)
    wallet_id: Mapped[str] = mapped_column(ForeignKey("wallets.id"), nullable=False)
    type: Mapped[TxType] = mapped_column(Enum(TxType), nullable=False)
    status: Mapped[TxStatus] = mapped_column(
        Enum(TxStatus), nullable=False, default=TxStatus.CONFIRMED
    )
    # positivo = crédito; negativo = débito
    amount_pts: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    # ID externo (charge, payout, transfer) para rastreabilidade
    reference: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # chave de idempotência (por usuário) — evita débito/crédito duplicado
    idempotency_key: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    wallet: Mapped[Wallet] = relationship(back_populates="transactions")

    __table_args__ = (
        UniqueConstraint(
            "wallet_id", "idempotency_key",
            name="uq_tx_idempotency",
        ),
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type.value,
            "status": self.status.value,
            "amount_pts": self.amount_pts,
            "description": self.description,
            "reference": self.reference,
            "created_at": self.created_at.isoformat(),
        }


# --------------------------------------------------------------------------- #
# PIX — cobrança (entrada de dinheiro → vira pontos)                          #
# --------------------------------------------------------------------------- #
class PixCharge(db.Model):
    __tablename__ = "pix_charges"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    package_key: Mapped[str] = mapped_column(String(20), nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    points_to_credit: Mapped[int] = mapped_column(Integer, nullable=False)
    txid: Mapped[str] = mapped_column(String(64), unique=True, default=_new_txid)
    br_code: Mapped[str] = mapped_column(String(1024), nullable=False)
    status: Mapped[PixChargeStatus] = mapped_column(
        Enum(PixChargeStatus), default=PixChargeStatus.PENDING, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    @classmethod
    def make_expiry(cls, ttl_seconds: int) -> datetime:
        return _utcnow() + timedelta(seconds=ttl_seconds)

    def is_expired(self) -> bool:
        # Trata datetimes naïve vindos do SQLite como UTC
        exp = self.expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        return _utcnow() > exp

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "package": self.package_key,
            "amount_brl": round(self.amount_cents / 100, 2),
            "points_to_credit": self.points_to_credit,
            "txid": self.txid,
            "br_code": self.br_code,
            "status": self.status.value,
            "expires_at": self.expires_at.isoformat(),
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }


# --------------------------------------------------------------------------- #
# PIX — payout (resgate: pontos saem → vira R$ na conta do usuário)           #
# --------------------------------------------------------------------------- #
class PixPayout(db.Model):
    __tablename__ = "pix_payouts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    points_debited: Mapped[int] = mapped_column(Integer, nullable=False)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    pix_key: Mapped[str] = mapped_column(String(180), nullable=False)
    txid: Mapped[str] = mapped_column(String(64), unique=True, default=_new_txid)
    end_to_end_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[PixPayoutStatus] = mapped_column(
        Enum(PixPayoutStatus), default=PixPayoutStatus.REQUESTED, nullable=False
    )
    failure_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "points_debited": self.points_debited,
            "amount_brl": round(self.amount_cents / 100, 2),
            "pix_key": self.pix_key,
            "txid": self.txid,
            "end_to_end_id": self.end_to_end_id,
            "status": self.status.value,
            "failure_reason": self.failure_reason,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
        }


# --------------------------------------------------------------------------- #
# Transfer P2P                                                                #
# --------------------------------------------------------------------------- #
class Transfer(db.Model):
    __tablename__ = "transfers"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_new_uuid)
    sender_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    recipient_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    amount_pts: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str | None] = mapped_column(String(140), nullable=True)
    receipt_code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    @staticmethod
    def make_receipt() -> str:
        # ENV-2026-XXXX-XXXX (espelha o padrão das telas de envio-concluido)
        year = _utcnow().year
        suffix = secrets.token_hex(4).upper()
        mid = secrets.token_hex(2).upper()
        return f"ENV-{year}-{mid}-{suffix}"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "recipient_id": self.recipient_id,
            "amount_pts": self.amount_pts,
            "message": self.message,
            "receipt_code": self.receipt_code,
            "created_at": self.created_at.isoformat(),
        }
