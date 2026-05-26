"""Configuracoes do app."""
from __future__ import annotations
import os


class Config:
    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL", "sqlite:///blaxx.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-change-me")

    CORS_ORIGINS = [
        o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()
    ] or ["*"]

    # 1 ponto = R$ 0,09 = 9 centavos
    CENTS_PER_POINT = int(os.environ.get("BLAXX_CENTS_PER_POINT", 9))
    REDEEM_MIN_POINTS = int(os.environ.get("BLAXX_REDEEM_MIN_POINTS", 1))
    REDEEM_MAX_POINTS_PER_DAY = int(os.environ.get(
        "BLAXX_REDEEM_MAX_POINTS_PER_DAY", 1_111_111
    ))
    TRANSFER_MIN_POINTS = 100
    TRANSFER_MAX_POINTS_PER_DAY = 50_000
    PIX_CHARGE_TTL_SECONDS = 30 * 60

    POINT_PACKAGES = {
        "start": {"price_brl": 180.00,  "points": 2_000,  "label": "Start"},
        "plus":  {"price_brl": 470.00,  "points": 5_500,  "label": "Plus"},
        "prime": {"price_brl": 972.00,  "points": 12_000, "label": "Prime"},
        "black": {"price_brl": 2142.00, "points": 28_000, "label": "Black"},
    }

    @classmethod
    def brl_per_point(cls) -> float:
        return cls.CENTS_PER_POINT / 100.0

    @classmethod
    def pts_to_cents(cls, pts: int) -> int:
        return pts * cls.CENTS_PER_POINT

    @classmethod
    def cents_to_pts(cls, cents: int) -> int:
        return cents // cls.CENTS_PER_POINT

    @classmethod
    def rate_label(cls) -> str:
        return f"1 pt = R$ {cls.brl_per_point():.2f}".replace(".", ",")


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    SECRET_KEY = "test"
