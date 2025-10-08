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
        use_tls_value = os.environ["SMTP_USE_TLS"].strip().lower()
        if use_tls_value in {"1", "true", "yes"}:
            use_tls = True
        elif use_tls_value in {"0", "false", "no"}:
            use_tls = False
        else:
            raise ValueError("SMTP_USE_TLS must be one of: 1/0/true/false/yes/no.")

        username = os.environ["SMTP_USER"]
        password = os.environ["SMTP_PASSWORD"]
        return cls(
            host=os.environ["SMTP_HOST"],
            port=int(os.environ["SMTP_PORT"]),
            username=username or None,
            password=password or None,
            use_tls=use_tls,
            from_address=os.environ["SMTP_FROM"],
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
