"""Servico de SMS com backends plugaveis.

Selecione via env SMS_BACKEND=console|twilio. O backend Console apenas loga
o conteudo no stdout — util em dev/CI. Twilio usa a API REST oficial.
"""
from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from abc import ABC, abstractmethod
from dataclasses import dataclass

from flask import current_app

log = logging.getLogger(__name__)


@dataclass
class SmsMessage:
    to_phone: str        # E.164 (ex: +5511999999999)
    body: str


class SmsBackend(ABC):
    @abstractmethod
    def send(self, msg: SmsMessage) -> None:
        ...


class ConsoleSmsBackend(SmsBackend):
    def send(self, msg: SmsMessage) -> None:
        log.info(
            "\n========== SMS (console backend) ==========\n"
            "To:   %s\n"
            "Body: %s\n"
            "===========================================",
            msg.to_phone,
            msg.body,
        )


class TwilioSmsBackend(SmsBackend):
    """Envia SMS via Twilio REST API sem dependencia externa (urllib stdlib)."""

    def __init__(self, account_sid: str, auth_token: str, from_phone: str):
        self.account_sid = account_sid
        self.auth_token = auth_token
        self.from_phone = from_phone

    def send(self, msg: SmsMessage) -> None:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        data = urllib.parse.urlencode({
            "From": self.from_phone,
            "To": msg.to_phone,
            "Body": msg.body,
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        # Basic auth
        import base64
        auth = base64.b64encode(f"{self.account_sid}:{self.auth_token}".encode()).decode()
        req.add_header("Authorization", f"Basic {auth}")
        req.add_header("Content-Type", "application/x-www-form-urlencoded")
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                if resp.status >= 300:
                    body = resp.read().decode("utf-8", errors="replace")
                    log.error("Twilio retornou %s: %s", resp.status, body[:200])
        except Exception:
            log.exception("Falha ao enviar SMS via Twilio para %s", msg.to_phone)
            raise


def get_backend() -> SmsBackend:
    cfg = current_app.config["_CONFIG"]
    name = (getattr(cfg, "SMS_BACKEND", None) or "console").lower()
    if name == "twilio":
        return TwilioSmsBackend(
            getattr(cfg, "TWILIO_ACCOUNT_SID", "") or "",
            getattr(cfg, "TWILIO_AUTH_TOKEN", "") or "",
            getattr(cfg, "TWILIO_FROM_PHONE", "") or "",
        )
    return ConsoleSmsBackend()


# ----------------------------------------------------------------------
# Helpers de alto nivel
# ----------------------------------------------------------------------
def _send_safe(msg: SmsMessage) -> None:
    try:
        get_backend().send(msg)
    except Exception:
        log.exception("Falha ao enviar SMS para %s", msg.to_phone)


def send_otp(phone: str, code: str, purpose: str) -> None:
    """purpose: 'verify_phone' | 'login_2fa'."""
    if purpose == "verify_phone":
        body = (
            f"BlaXx: seu codigo para validar o telefone e {code}. "
            "Expira em 10 minutos. Nunca compartilhe este codigo."
        )
    else:
        body = (
            f"BlaXx: seu codigo de login e {code}. "
            "Expira em 5 minutos. Se nao foi voce, troque sua senha imediatamente."
        )
    _send_safe(SmsMessage(to_phone=phone, body=body))


def send_security_alert(phone: str, event: str) -> None:
    body = f"BlaXx: alerta de seguranca - {event}. Se nao foi voce, contate o suporte."
    _send_safe(SmsMessage(to_phone=phone, body=body))
