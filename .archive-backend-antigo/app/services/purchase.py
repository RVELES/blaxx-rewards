"""Compra de pontos via PIX.

Fluxo:
  1) Usuário escolhe um pacote → POST /pix/charge
  2) Sistema cria PixCharge (PENDING), pede BR Code ao provider, devolve QR.
  3) Usuário paga no banco. Provedor envia webhook → POST /pix/webhook
  4) Webhook marca PixCharge como PAID e credita os pontos na carteira.
     A operação é idempotente (mesmo webhook duas vezes não dobra pontos).
"""

from __future__ import annotations

from datetime import datetime, timezone

from flask import current_app

from ..config import Config
from ..extensions import db
from ..models import (
    PixCharge,
    PixChargeStatus,
    TxType,
    User,
)
from ..pix.provider import PixChargeRequest, PixProvider
from . import wallet as wallet_svc


class PixError(Exception):
    pass


def list_packages() -> dict:
    return Config.POINT_PACKAGES


def _provider() -> PixProvider:
    return current_app.extensions["pix_provider"]


def create_charge(user: User, package_key: str) -> PixCharge:
    pkg = Config.POINT_PACKAGES.get(package_key)
    if pkg is None:
        raise PixError(f"pacote desconhecido: {package_key}")

    amount_cents = int(round(pkg["price_brl"] * 100))

    charge = PixCharge(
        user_id=user.id,
        package_key=package_key,
        amount_cents=amount_cents,
        points_to_credit=pkg["points"],
        br_code="",  # será preenchido a seguir
        expires_at=PixCharge.make_expiry(Config.PIX_CHARGE_TTL_SECONDS),
    )
    db.session.add(charge)
    db.session.flush()  # garante txid

    resp = _provider().create_charge(
        PixChargeRequest(
            txid=charge.txid,
            amount_cents=amount_cents,
            description=f"Blaxx Pontos — pacote {pkg['label']}",
            payer_name=user.name,
            payer_cpf=user.cpf,
            expires_in_seconds=Config.PIX_CHARGE_TTL_SECONDS,
        )
    )
    charge.br_code = resp.br_code
    db.session.commit()
    return charge


def confirm_payment(txid: str) -> PixCharge:
    """Chamado pelo webhook do provedor PIX quando o pagamento é confirmado.

    Idempotente: chamadas repetidas com o mesmo txid não creditam de novo.
    """
    charge = db.session.query(PixCharge).filter_by(txid=txid).one_or_none()
    if charge is None:
        raise PixError(f"charge não encontrada: txid={txid}")

    if charge.status == PixChargeStatus.PAID:
        return charge  # já foi processada

    if charge.status == PixChargeStatus.EXPIRED or charge.is_expired():
        charge.status = PixChargeStatus.EXPIRED
        db.session.commit()
        raise PixError("charge expirada")

    charge.status = PixChargeStatus.PAID
    charge.paid_at = datetime.now(timezone.utc)

    wallet_svc.credit(
        user_id=charge.user_id,
        amount_pts=charge.points_to_credit,
        tx_type=TxType.PURCHASE,
        description=f"Compra de pontos — pacote {charge.package_key}",
        reference=charge.id,
        idempotency_key=f"charge:{charge.id}",  # blinda contra webhook duplicado
    )
    db.session.commit()
    return charge


def expire_if_needed(charge: PixCharge) -> PixCharge:
    if charge.status == PixChargeStatus.PENDING and charge.is_expired():
        charge.status = PixChargeStatus.EXPIRED
        db.session.commit()
    return charge
