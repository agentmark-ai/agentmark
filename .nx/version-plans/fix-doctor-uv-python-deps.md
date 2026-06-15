---
'@agentmark-ai/cli': patch
---

Fix `doctor` reporting installed Python packages as missing in uv-based projects. uv-created virtualenvs ship no `pip`, so the old `pip show` probe found nothing and advised a wrong `pip install`. The check now probes via `importlib.metadata` (works without pip) and tailors the fix to the project's installer (`uv add` for uv projects, `pip install` otherwise).
