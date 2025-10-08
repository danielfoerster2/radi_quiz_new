from __future__ import annotations

import logging
import os
from pathlib import Path

from flask import Flask, g, request

from .config import load_config
from .database import get_connection, init_app as init_database, transaction
from .session_manager import (
    get_active_session,
    mark_session_activity,
)
from .utils import current_timestamp, to_isoformat
from .workspace import mark_workspace_decrypted, provision_user_workspace


LOGGER = logging.getLogger(__name__)


def create_app() -> Flask:
    app = Flask(__name__)

    config = load_config()
    app.config["SECRET_KEY"] = config.secret_key
    app.config["DATABASE_URL"] = config.database_url
    app.config["STORAGE_ROOT"] = str(config.storage_root)
    app.config["SESSION_LIFETIME"] = config.session_lifetime
    app.config["VERIFICATION_CODE_LENGTH"] = config.verification_code_length
    app.config["SESSION_COOKIE_NAME"] = config.session_cookie_name
    app.config["SESSION_COOKIE_SECURE"] = config.session_cookie_secure
    app.config["ENVIRONMENT"] = config.environment
    app.config["GOOGLE_CLIENT_ID"] = os.getenv("GOOGLE_CLIENT_ID")
    app.config["GOOGLE_CLIENT_SECRET"] = os.getenv("GOOGLE_CLIENT_SECRET")

    init_database(app)

    @app.before_request
    def load_authenticated_user():
        g.current_user = None
        g.current_session = None
        token = request.cookies.get(app.config["SESSION_COOKIE_NAME"])
        if not token:
            return

        session = get_active_session(token)
        if not session:
            return

        conn = get_connection()
        user_row = conn.execute(
            "SELECT * FROM users WHERE user_uuid = ?",
            (session["user_uuid"],),
        ).fetchone()
        if user_row is None:
            LOGGER.warning("Session with unknown user_uuid detected; revoking.")
            return

        g.current_user = dict(user_row)
        g.current_session = session
        mark_session_activity(session["id"])

        now = current_timestamp()
        with transaction() as tx_conn:
            tx_conn.execute(
                "UPDATE users SET last_active = ?, updated_at = ? WHERE user_uuid = ?",
                (
                    to_isoformat(now),
                    to_isoformat(now),
                    session["user_uuid"],
                ),
            )

        if user_row["workspace_is_encrypted"]:
            storage_root = Path(app.config["STORAGE_ROOT"])
            workspace = storage_root / session["user_uuid"]
            try:
                mark_workspace_decrypted(workspace)
                with transaction() as tx_conn:
                    tx_conn.execute(
                        """
                        UPDATE users
                        SET workspace_is_encrypted = 0, updated_at = ?
                        WHERE user_uuid = ?
                        """,
                        (
                            to_isoformat(now),
                            session["user_uuid"],
                        ),
                    )
            except FileNotFoundError:
                LOGGER.warning("Workspace missing for user %s; provisioning.", session["user_uuid"])
                provision_user_workspace(storage_root, session["user_uuid"])

    from .routes import auth_bp, account_bp, classes_bp

    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(account_bp)
    app.register_blueprint(classes_bp)

    return app


__all__ = ["create_app"]
