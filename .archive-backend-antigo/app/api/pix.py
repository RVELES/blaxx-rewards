"""Endpoints de PIX — compra de pontos.

Endpoints:
  GET  /pix/packages              → lista de pacotes disponíveis
  POST /pix/charge                → cria cobrança (BR Code) para comprar pontos
  GET  /pix/charge/<id>           → consulta status
  POST /pix/webhook               → callback do provedor (não exige auth)
  POST /pix/simulate-payment      → SOMENTE no mock: força pagamento de uma charge
"""

from __future__ import annotations

from flask import Blueprint, current_app, g, jsonify, request

from ..extensions import db
from ..models import PixCharge
from ..services import purchase as purchase_svc
from .auth import login_required

bp = Blueprint("pix", __name__)


@bp.get("/packages")
def packages():
    return jsonify(purchase_svc.list_packages())


@bp.post("/charge")
@login_required
def create_charge():
    data = request.get_json(silent=True) or {}
    package_key = (data.get("package") or "").strip().lower()
    try:
        charge = purchase_svc.create_charge(g.current_user, package_key)
    except purchase_svc.PixError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(charge.to_dict()), 201


@bp.get("/charge/<charge_id>")
@login_required
def get_charge(charge_id: str):
    charge = db.session.get(PixCharge, charge_id)
    if charge is None or charge.user_id != g.current_user.id:
        return jsonify({"error": "not found"}), 404
    purchase_svc.expire_if_needed(charge)
    return jsonify(charge.to_dict())


@bp.post("/webhook")
def webhook():
    """Endpoint público — provedor PIX bate aqui ao confirmar pagamento.

    Em produção:
      - Validar assinatura (HMAC) do provedor.
      - Restringir IPs / mTLS.
      - Aceitar payloads no formato do provedor (Mercado Pago, Asaas, etc.).
    """
    data = request.get_json(silent=True) or {}
    txid = data.get("txid") or data.get("id") or ""
    if not txid:
        return jsonify({"error": "txid ausente"}), 400

    try:
        charge = purchase_svc.confirm_payment(txid)
    except purchase_svc.PixError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"received": True, "charge": charge.to_dict()})


@bp.post("/simulate-payment")
@login_required
def simulate_payment():
    """Atalho para o protótipo: simula que o usuário pagou o PIX agora.

    Em produção, o webhook do provedor é o caminho oficial.
    """
    if current_app.extensions["pix_provider"].name != "mock":
        return jsonify({"error": "endpoint só está disponível no provider mock"}), 403

    data = request.get_json(silent=True) or {}
    charge_id = data.get("charge_id")
    charge = db.session.get(PixCharge, charge_id)
    if charge is None or charge.user_id != g.current_user.id:
        return jsonify({"error": "charge não encontrada"}), 404

    try:
        charge = purchase_svc.confirm_payment(charge.txid)
    except purchase_svc.PixError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"ok": True, "charge": charge.to_dict()})
