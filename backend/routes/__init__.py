from __future__ import annotations

from .auth import auth_bp
from .account import account_bp
from .classes import classes_bp
from .quizzes import quizzes_bp

__all__ = ["auth_bp", "account_bp", "classes_bp", "quizzes_bp"]
