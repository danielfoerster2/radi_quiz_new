from __future__ import annotations

import mimetypes
import os
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from pathlib import Path
from typing import Dict, Optional, Sequence


class _TemplateDict(dict):
    def __missing__(self, key: str) -> str:
        return "{" + key + "}"


@dataclass
class EmailConfig:
    host: str
    port: int
    username: Optional[str]
    password: Optional[str]
    use_tls: bool
    from_address: str

    @classmethod
    def from_env(cls) -> "EmailConfig":
        def _get_env(key: str, default: Optional[str] = None) -> Optional[str]:
            value = os.environ.get(key, default)
            if value is None:
                return None
            value = value.strip()
            return value or None

        host = _get_env("SMTP_HOST")
        if not host:
            raise KeyError("SMTP_HOST")

        try:
            port = int(_get_env("SMTP_PORT", "587") or "587")
        except ValueError as exc:
            raise ValueError("SMTP_PORT must be an integer.") from exc

        username = _get_env("SMTP_USER")
        password = _get_env("SMTP_PASSWORD")
        from_address = _get_env("SMTP_FROM")
        if not from_address:
            raise KeyError("SMTP_FROM")
        return cls(
            host=host,
            port=port,
            username=username,
            password=password,
            use_tls=True,
            from_address=from_address,
        )


@dataclass
class EmailRequest:
    to: Sequence[str]
    subject: str
    body: str
    reply_to: Optional[str]
    bcc: Sequence[str]
    attachments: Sequence[Path]


def render_template(template: str, context: Dict[str, str]) -> str:
    safe_context = _TemplateDict(**context)
    return template.format_map(safe_context)


def send_email(config: EmailConfig, request: EmailRequest) -> None:
    if not config.from_address:
        raise ValueError("EmailConfig.from_address must be provided.")

    message = EmailMessage()
    message["Subject"] = request.subject
    message["From"] = config.from_address
    message["To"] = ", ".join(request.to)
    if request.reply_to:
        message["Reply-To"] = request.reply_to
    if request.bcc:
        message["Bcc"] = ", ".join(request.bcc)
    message.set_content(request.body)

    for attachment in request.attachments:
        path = Path(attachment)
        data = path.read_bytes()
        mime, _ = mimetypes.guess_type(path.name)
        maintype, subtype = ("application", "octet-stream")
        if mime:
            parts = mime.split("/", 1)
            if len(parts) == 2:
                maintype, subtype = parts
        message.add_attachment(data, maintype=maintype, subtype=subtype, filename=path.name)

    with smtplib.SMTP(config.host, config.port) as smtp:
        if config.use_tls:
            smtp.starttls()
        if config.username and config.password:
            smtp.login(config.username, config.password)
        smtp.send_message(message)


__all__ = ["EmailConfig", "EmailRequest", "render_template", "send_email"]
