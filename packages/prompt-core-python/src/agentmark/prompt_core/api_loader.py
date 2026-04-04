"""API Loader for AgentMark prompt core.

Fetches prompts and datasets from the AgentMark API (cloud mode)
or a local dev server. Mirrors the TypeScript ApiLoader from @agentmark-ai/loader-api.
"""

from __future__ import annotations

import json
import os
from typing import Any

import httpx

from .types import DatasetStream, PromptKind


AGENTMARK_TEMPLATE_ENDPOINT = "v1/templates"


class ApiDatasetReader:
    """A dataset reader that reads items from a pre-fetched list."""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        self._items = items
        self._index = 0

    async def read(self) -> dict[str, Any]:
        if self._index >= len(self._items):
            return {"done": True}
        item = self._items[self._index]
        self._index += 1
        return {"done": False, "value": item}


class ApiDatasetStream:
    """A dataset stream backed by an API response."""

    def __init__(self, items: list[dict[str, Any]]) -> None:
        self._items = items

    def get_reader(self) -> ApiDatasetReader:
        return ApiDatasetReader(self._items)


class ApiLoader:
    """Loader that fetches prompts and datasets from the AgentMark API.

    Matches the TypeScript ApiLoader from @agentmark-ai/loader-api.

    Example (cloud mode):
        loader = ApiLoader.cloud(
            api_key=os.environ["AGENTMARK_API_KEY"],
            app_id=os.environ["AGENTMARK_APP_ID"],
        )

    Example (local dev):
        loader = ApiLoader.local(base_url="http://localhost:9418")
    """

    def __init__(
        self,
        base_url: str,
        api_key: str | None = None,
        app_id: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._app_id = app_id

    @classmethod
    def cloud(
        cls,
        api_key: str | None = None,
        app_id: str | None = None,
        base_url: str | None = None,
    ) -> ApiLoader:
        """Create a loader for cloud/production use.

        Falls back to AGENTMARK_API_KEY, AGENTMARK_APP_ID, and
        AGENTMARK_BASE_URL environment variables if not provided.
        """
        return cls(
            base_url=base_url or os.environ.get("AGENTMARK_BASE_URL", "https://api.agentmark.co"),
            api_key=api_key or os.environ.get("AGENTMARK_API_KEY"),
            app_id=app_id or os.environ.get("AGENTMARK_APP_ID"),
        )

    @classmethod
    def local(cls, base_url: str = "http://localhost:9418") -> ApiLoader:
        """Create a loader for local development."""
        return cls(base_url=base_url)

    async def load(
        self,
        path: str,
        prompt_type: PromptKind,
        options: dict[str, Any] | None = None,
    ) -> Any:
        """Load a prompt AST from the API."""
        data = await self._fetch_request(
            {"path": path, "promptKind": prompt_type}
        )
        return data

    async def load_dataset(self, dataset_path: str) -> DatasetStream:
        """Load a dataset from the API as a stream of JSONL rows."""
        response = await self._fetch_request(
            {"path": dataset_path},
            stream=True,
        )

        # Parse NDJSON lines into items
        items: list[dict[str, Any]] = []
        if isinstance(response, str):
            for line in response.strip().split("\n"):
                line = line.strip()
                if line:
                    parsed = json.loads(line)
                    if isinstance(parsed, list):
                        items.extend(parsed)
                    else:
                        items.append(parsed)
        elif isinstance(response, list):
            items = response

        if not items:
            raise ValueError(
                f"Dataset {dataset_path} is empty or contains no valid rows"
            )

        # Validate rows
        for item in items:
            if not isinstance(item.get("input"), dict):
                raise ValueError(
                    f"Invalid dataset row: missing or invalid 'input' field. "
                    f"Each row must have an 'input' object."
                )

        return ApiDatasetStream(items)

    async def _fetch_request(
        self,
        query_params: dict[str, str],
        stream: bool = False,
    ) -> Any:
        headers: dict[str, str] = {"Content-Type": "application/json"}

        # Auth headers for cloud mode
        if self._api_key and self._app_id:
            headers["X-Agentmark-App-Id"] = self._app_id
            headers["Authorization"] = self._api_key

        if stream:
            headers["Accept"] = "application/x-ndjson"

        url = f"{self._base_url}/{AGENTMARK_TEMPLATE_ENDPOINT}"

        async with httpx.AsyncClient() as client:
            response = await client.get(
                url,
                params=query_params,
                headers=headers,
                timeout=30.0,
            )

        if response.status_code == 200:
            if stream:
                return response.text
            return response.json().get("data")

        try:
            error_data = response.json()
            raise ValueError(error_data.get("error", f"API error: {response.status_code}"))
        except (json.JSONDecodeError, ValueError):
            raise ValueError(f"API error: {response.status_code} {response.text[:200]}")


__all__ = [
    "ApiLoader",
    "ApiDatasetStream",
    "ApiDatasetReader",
]
