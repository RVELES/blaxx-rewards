"""Autenticação simplificada via header Bearer.

Para o protótipo usamos um "token" igual ao próprio user_id (sem JWT/sessão).
Fácil de demonstrar com curl e fácil de trocar por OAuth/JWT depois.
"""

from __future__ import annotations

from functools import wraps

from flask import Blueprint, current_app, g, jsonify, request

from ..extensions import db
from ..models import User

bp = Blueprint("auth", __name__)


def _bearer_user() -> User | None:
    auth = request.headers.get("Authorization", "")
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    return db.session.get(User, token)


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = _bearer_user()
        if user is None:
            return jsonify({"error": "unauthorized"}), 401
        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


@bp.post("/login")
def login():
    """Login mock — devolve token = user_id se a senha bater.

    Em produção: trocar por JWT (PyJWT) ou Flask-Login.
    """
    data = request.get_json(silent=True) or {}
    identifier = (data.get("email") or data.get("cpf") or "").strip().lower()
    password = data.get("password") or ""

    if "@" in identifier:
        user = db.session.query(User).filter_by(email=identifier).one_or_none()
    else:
        user = db.session.query(User).filter_by(cpf=identifier).one_or_none()

    if user is None or not user.check_password(password):
        return jsonify({"error": "credenciais inválidas"}), 401

    return jsonify({
        "token": user.id,
        "token_type": "Bearer",
        "user": user.to_dict(),
    })


@bp.get("/me")
@login_required
def me():
    return jsonify(g.current_user.to_dict())
