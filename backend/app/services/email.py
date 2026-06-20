"""Servico de email com backends plugaveis.

Selecione via env EMAIL_BACKEND=console|smtp. O backend ConsoleEmailBackend apenas
loga o conteudo no stdout — util em dev/CI. SMTP usa smtplib do stdlib.
"""
from __future__ import annotations

import logging
import smtplib
from abc import ABC, abstractmethod
from dataclasses import dataclass
from email.message import EmailMessage

from flask import current_app

log = logging.getLogger(__name__)


@dataclass
class EmailEnvelope:
    to: str
    subject: str
    html: str
    text: str


class EmailBackend(ABC):
    @abstractmethod
    def send(self, env: EmailEnvelope) -> None:
        ...


class ConsoleEmailBackend(EmailBackend):
    def send(self, env: EmailEnvelope) -> None:
        log.info(
            "\n========== EMAIL (console backend) ==========\n"
            "To:      %s\n"
            "Subject: %s\n"
            "---\n"
            "%s\n"
            "=============================================",
            env.to,
            env.subject,
            env.text,
        )


class SmtpEmailBackend(EmailBackend):
    def __init__(self, host: str, port: int, username: str, password: str, use_tls: bool):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_tls = use_tls

    def send(self, env: EmailEnvelope) -> None:
        cfg = current_app.config["_CONFIG"]
        msg = EmailMessage()
        msg["From"] = f"{cfg.EMAIL_FROM_NAME} <{cfg.EMAIL_FROM}>"
        msg["To"] = env.to
        msg["Subject"] = env.subject
        msg.set_content(env.text)
        msg.add_alternative(env.html, subtype="html")

        with smtplib.SMTP(self.host, self.port, timeout=15) as s:
            s.ehlo()
            if self.use_tls:
                s.starttls()
                s.ehlo()
            if self.username:
                s.login(self.username, self.password)
            s.send_message(msg)


def get_backend() -> EmailBackend:
    cfg = current_app.config["_CONFIG"]
    name = (cfg.EMAIL_BACKEND or "console").lower()
    if name == "smtp":
        return SmtpEmailBackend(
            cfg.SMTP_HOST,
            cfg.SMTP_PORT,
            cfg.SMTP_USERNAME,
            cfg.SMTP_PASSWORD,
            cfg.SMTP_USE_TLS,
        )
    return ConsoleEmailBackend()


# ----------------------------------------------------------------------
# Helpers de alto nivel — chamados pelas APIs
# ----------------------------------------------------------------------
def _send(to: str, subject: str, html: str, text: str) -> None:
    try:
        get_backend().send(EmailEnvelope(to=to, subject=subject, html=html, text=text))
    except Exception:
        # Falha de email nao deve quebrar o fluxo de auth — apenas log.
        log.exception("Falha ao enviar email para %s (subject=%s)", to, subject)


def _wrap(title: str, body: str, cta_text: str | None, cta_url: str | None) -> str:
    cfg = current_app.config["_CONFIG"]
    cta = (
        f'<p style="text-align:center;margin:24px 0;">'
        f'<a href="{cta_url}" style="background:#0B1820;color:#7CFF00;padding:12px 24px;'
        f'border-radius:24px;text-decoration:none;font-weight:600;">{cta_text}</a></p>'
        if cta_text and cta_url
        else ""
    )
    return f"""<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;background:#f5f5f5;padding:24px;">
<table style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;">
<tr><td>
<h1 style="color:#0B1820;font-size:22px;">{title}</h1>
{body}
{cta}
<p style="font-size:12px;color:#666;margin-top:32px;">
Se voce nao solicitou este email, pode ignora-lo com seguranca.<br>
{cfg.EMAIL_FROM_NAME} — atendimento@blaxx.com.br
</p>
</td></tr></table></body></html>"""


def send_verification_email(to: str, name: str, link: str) -> None:
    subject = "Confirme seu email no BlaXx"
    body_html = (
        f"<p>Ola {name},</p>"
        f"<p>Para ativar sua conta, clique no botao abaixo. O link expira em 24 horas.</p>"
    )
    body_text = (
        f"Ola {name},\n\n"
        f"Para ativar sua conta no BlaXx, abra este link (expira em 24h):\n{link}\n\n"
        "Se voce nao se cadastrou, ignore este email.\n"
    )
    _send(to, subject, _wrap("Confirme seu email", body_html, "Confirmar email", link), body_text)


def send_password_reset_email(to: str, name: str, link: str) -> None:
    subject = "Recuperacao de senha — BlaXx"
    body_html = (
        f"<p>Ola {name},</p>"
        f"<p>Recebemos um pedido de redefinicao de senha. Clique no botao abaixo para "
        f"escolher uma nova senha. O link expira em 1 hora.</p>"
    )
    body_text = (
        f"Ola {name},\n\n"
        f"Para redefinir sua senha do BlaXx, abra este link (expira em 1h):\n{link}\n\n"
        "Se voce nao solicitou, ignore este email — sua senha continua a mesma.\n"
    )
    _send(to, subject, _wrap("Redefinir senha", body_html, "Redefinir senha", link), body_text)


def send_password_changed_email(to: str, name: str) -> None:
    subject = "Sua senha foi alterada — BlaXx"
    body_html = (
        f"<p>Ola {name},</p>"
        f"<p>Sua senha foi alterada agora. Se nao foi voce, recupere o acesso "
        f"imediatamente e entre em contato com o suporte.</p>"
    )
    body_text = (
        f"Ola {name},\n\n"
        "Sua senha foi alterada. Se voce nao reconhece esta acao, entre em contato com o suporte.\n"
    )
    _send(to, subject, _wrap("Senha alterada", body_html, None, None), body_text)


def send_email_changed_email(to_old: str, to_new: str, name: str, link: str) -> None:
    """Notifica email antigo + envia confirmacao ao novo email."""
    subject_new = "Confirme seu novo email — BlaXx"
    body_new_html = (
        f"<p>Ola {name},</p>"
        f"<p>Voce solicitou alterar o email do seu cadastro. Clique no botao para confirmar. "
        f"O link expira em 24 horas.</p>"
    )
    body_new_text = (
        f"Ola {name},\n\n"
        f"Para confirmar seu novo email, abra: {link}\n"
        "Expira em 24h.\n"
    )
    _send(to_new, subject_new, _wrap("Confirmar novo email", body_new_html, "Confirmar", link), body_new_text)

    subject_old = "Solicitacao de troca de email — BlaXx"
    body_old_html = (
        f"<p>Ola {name},</p>"
        f"<p>Recebemos um pedido para trocar o email da sua conta. Se nao foi voce, "
        f"entre em contato com o suporte imediatamente.</p>"
    )
    body_old_text = (
        f"Ola {name},\n\n"
        "Recebemos uma solicitacao para trocar o email da sua conta. Se nao foi voce, contate o suporte.\n"
    )
    _send(to_old, subject_old, _wrap("Solicitacao de troca de email", body_old_html, None, None), body_old_text)
