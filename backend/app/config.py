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

    POINTS_PER_BRL = 100
    REDEEM_MIN_POINTS = 2_500
    REDEEM_MAX_POINTS_PER_DAY = 100_000
    TRANSFER_MIN_POINTS = 100
    TRANSFER_MAX_POINTS_PER_DAY = 50_000
    PIX_CHARGE_TTL_SECONDS = 30 * 60

    POINT_PACKAGES = {
        "start": {"price_brl": 19.90, "points": 2_000, "label": "Start"},
        "plus":  {"price_brl": 49.90, "points": 5_500, "label": "Plus"},
        "prime": {"price_brl": 99.90, "points": 12_000, "label": "Prime"},
        "black": {"price_brl": 199.90, "points": 28_000, "label": "Black"},
    }


class TestConfig(Config):
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    TESTING = True
    SECRET_KEY = "test"
