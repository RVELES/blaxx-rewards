"""Cria 2 usuários de exemplo + saldo inicial. Idempotente.

Usuários:
  mariana@blaxx.com / 123456 — saldo inicial 84.750 pts (igual ao mock das telas)
  lucas@blaxx.com   / 123456 — saldo inicial 5.000 pts
"""

from __future__ import annotations

from app import create_app
from app.extensions import db
from app.models import TxType, User, Wallet
from app.services import wallet as wallet_svc


SEED_USERS = [
    {
        "name": "Mariana Costa",
        "email": "mariana@blaxx.com",
        "cpf": "12345678900",
        "password": "123456",
        "pix_key": "mariana@blaxx.com",
        "initial_pts": 84_750,
    },
    {
        "name": "Lucas Andrade",
        "email": "lucas@blaxx.com",
        "cpf": "98765432100",
        "password": "123456",
        "pix_key": "lucas@blaxx.com",
        "initial_pts": 5_000,
    },
]


def main() -> None:
    app = create_app()
    with app.app_context():
        for u in SEED_USERS:
            user = db.session.query(User).filter_by(email=u["email"]).one_or_none()
            if user:
                print(f"  [skip] {u['email']} já existe")
                continue
            user = User(
                name=u["name"], email=u["email"], cpf=u["cpf"], pix_key=u["pix_key"],
            )
            user.set_password(u["password"])
            db.session.add(user)
            db.session.flush()
            db.session.add(Wallet(user_id=user.id))
            db.session.flush()
            if u["initial_pts"]:
                wallet_svc.credit(
                    user_id=user.id,
                    amount_pts=u["initial_pts"],
                    tx_type=TxType.BONUS,
                    description="Saldo inicial (seed)",
                )
            db.session.commit()
            print(f"  [ok]   {u['email']} → {u['initial_pts']} pts")


if __name__ == "__main__":
    main()
