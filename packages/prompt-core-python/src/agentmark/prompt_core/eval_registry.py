"""Eval registry type for evaluation functions."""

from typing import Dict

from .types import EvalFunction

EvalRegistry = Dict[str, EvalFunction]
