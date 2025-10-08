from __future__ import annotations

from .auth import auth_bp
from .account import account_bp
from .classes import classes_bp
from .quizzes import quizzes_bp
from .questions import questions_bp
from .amc import amc_bp
from .analysis import analysis_bp

__all__ = [
    "auth_bp",
    "account_bp",
    "classes_bp",
    "quizzes_bp",
    "questions_bp",
    "amc_bp",
    "analysis_bp",
]
