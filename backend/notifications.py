from __future__ import annotations

import logging
from datetime import datetime

from .services.email_service import (
    EmailConfig,
    EmailRequest,
    render_template,
    send_email,
)

LOGGER = logging.getLogger(__name__)


def _load_email_config() -> EmailConfig | None:
    try:
        return EmailConfig.from_env()
    except KeyError:
        LOGGER.warning("Email environment configuration is incomplete; skipping send.")
    except ValueError:
        LOGGER.exception("Invalid email configuration; skipping send.")
    return None


def send_verification_email(recipient: str, code: str) -> bool:
    config = _load_email_config()
    if config is None:
        return False
    subject = "Radi Quiz - Vérification de votre compte"
    body_template = (
        "Bonjour,\n\n"
        "Votre code de vérification Radi Quiz est : {code}\n\n"
        "Ce code expire dans 15 minutes.\n\n"
        "Merci,\nL'équipe Radi Quiz"
    )
    body = render_template(body_template, {"code": code})
    request = EmailRequest(
        to=[recipient],
        subject=subject,
        body=body,
        reply_to=None,
        bcc=[],
        attachments=[],
    )
    try:
        send_email(config, request)
        return True
    except Exception:
        LOGGER.exception("Failed to send verification email.")
        return False


def send_password_reset_email(recipient: str, otp: str, expires_at: datetime) -> bool:
    config = _load_email_config()
    if config is None:
        return False
    subject = "Radi Quiz - Code de réinitialisation"
    body_template = (
        "Bonjour,\n\n"
        "Utilisez le code à usage unique suivant pour réinitialiser votre mot de passe Radi Quiz : {otp}\n"
        "Ce code expire le {expires_at} (UTC).\n\n"
        "Merci,\nL'équipe Radi Quiz"
    )
    body = render_template(
        body_template,
        {
            "otp": otp,
            "expires_at": expires_at.strftime("%Y-%m-%d %H:%M:%S"),
        },
    )
    request = EmailRequest(
        to=[recipient],
        subject=subject,
        body=body,
        reply_to=None,
        bcc=[],
        attachments=[],
    )
    try:
        send_email(config, request)
        return True
    except Exception:
        LOGGER.exception("Failed to send password reset email.")
        return False


__all__ = ["send_verification_email", "send_password_reset_email"]
