"""Configuracao centralizada lendo de variaveis de ambiente."""
import os
from dataclasses import dataclass


def _bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Config:
    SECRET_KEY: str = os.environ.get("SECRET_KEY", "dev-secret-troque-em-producao")
    APP_URL: str = os.environ.get("APP_URL", "http://localhost:8000")
    FLASK_ENV: str = os.environ.get("FLASK_ENV", "production")

    SQLALCHEMY_DATABASE_URI: str = os.environ.get("DATABASE_URL", "sqlite:///blaxx.db")
    SQLALCHEMY_TRACK_MODIFICATIONS: bool = False

    CORS_ORIGINS: tuple[str, ...] = tuple(
        _csv(os.environ.get("CORS_ORIGINS")) or ["http://localhost:8000"]
    )

    EMAIL_BACKEND: str = os.environ.get("EMAIL_BACKEND", "console")
    EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "noreply@blaxx.com.br")
    EMAIL_FROM_NAME: str = os.environ.get("EMAIL_FROM_NAME", "Blaxx Pontos")

    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.environ.get("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD", "")
    SMTP_USE_TLS: bool = _bool(os.environ.get("SMTP_USE_TLS"), default=True)

    GOOGLE_CLIENT_ID: str = os.environ.get("GOOGLE_CLIENT_ID", "")

    EMAIL_VERIFICATION_TOKEN_TTL: int = int(
        os.environ.get("EMAIL_VERIFICATION_TOKEN_TTL", "86400")
    )
    PASSWORD_RESET_TOKEN_TTL: int = int(
        os.environ.get("PASSWORD_RESET_TOKEN_TTL", "3600")
    )
    SESSION_TTL: int = int(os.environ.get("SESSION_TTL", "2592000"))

    LOGIN_RATE_LIMIT_PER_IP: int = int(os.environ.get("LOGIN_RATE_LIMIT_PER_IP", "20"))
    LOGIN_RATE_LIMIT_WINDOW: int = int(os.environ.get("LOGIN_RATE_LIMIT_WINDOW", "600"))
    RESEND_VERIFICATION_COOLDOWN: int = int(
        os.environ.get("RESEND_VERIFICATION_COOLDOWN", "60")
    )


def load_config() -> Config:
    return Config()
