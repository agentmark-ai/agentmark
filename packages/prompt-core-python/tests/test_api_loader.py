"""Tests for ApiLoader, ApiDatasetStream, and ApiDatasetReader."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from agentmark.prompt_core.api_loader import (
    AGENTMARK_TEMPLATE_ENDPOINT,
    ApiDatasetReader,
    ApiDatasetStream,
    ApiLoader,
)


# ---------------------------------------------------------------------------
# ApiLoader.cloud() factory
# ---------------------------------------------------------------------------


class TestApiLoaderCloud:
    """Tests for the ApiLoader.cloud() class method."""

    def test_should_use_agentmark_base_url_env_var_when_base_url_not_provided(
        self,
    ) -> None:
        with patch.dict(
            "os.environ",
            {"AGENTMARK_BASE_URL": "https://custom.example.com"},
            clear=False,
        ):
            loader = ApiLoader.cloud(api_key="key", app_id="app")
        assert loader._base_url == "https://custom.example.com"

    def test_should_use_provided_base_url_over_env_var(self) -> None:
        with patch.dict(
            "os.environ",
            {"AGENTMARK_BASE_URL": "https://env.example.com"},
            clear=False,
        ):
            loader = ApiLoader.cloud(
                api_key="key",
                app_id="app",
                base_url="https://explicit.example.com",
            )
        assert loader._base_url == "https://explicit.example.com"

    def test_should_use_agentmark_api_key_and_app_id_from_env(self) -> None:
        with patch.dict(
            "os.environ",
            {"AGENTMARK_API_KEY": "env-key", "AGENTMARK_APP_ID": "env-app"},
            clear=False,
        ):
            loader = ApiLoader.cloud()
        assert loader._api_key == "env-key"
        assert loader._app_id == "env-app"

    def test_should_default_base_url_to_production_api(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            loader = ApiLoader.cloud(api_key="key", app_id="app")
        assert loader._base_url == "https://api.agentmark.co"

    def test_should_strip_trailing_slash_from_base_url(self) -> None:
        loader = ApiLoader.cloud(
            api_key="key",
            app_id="app",
            base_url="https://api.example.com/",
        )
        assert loader._base_url == "https://api.example.com"

    def test_should_prefer_explicit_api_key_over_env(self) -> None:
        with patch.dict(
            "os.environ",
            {"AGENTMARK_API_KEY": "env-key"},
            clear=False,
        ):
            loader = ApiLoader.cloud(api_key="explicit-key", app_id="app")
        assert loader._api_key == "explicit-key"

    def test_should_prefer_explicit_app_id_over_env(self) -> None:
        with patch.dict(
            "os.environ",
            {"AGENTMARK_APP_ID": "env-app"},
            clear=False,
        ):
            loader = ApiLoader.cloud(api_key="key", app_id="explicit-app")
        assert loader._app_id == "explicit-app"

    def test_should_set_api_key_to_none_when_not_provided_and_not_in_env(self) -> None:
        with patch.dict("os.environ", {}, clear=True):
            loader = ApiLoader.cloud()
        assert loader._api_key is None
        assert loader._app_id is None


# ---------------------------------------------------------------------------
# ApiLoader.local() factory
# ---------------------------------------------------------------------------


class TestApiLoaderLocal:
    """Tests for the ApiLoader.local() class method."""

    def test_should_use_provided_base_url(self) -> None:
        loader = ApiLoader.local(base_url="http://myhost:5000")
        assert loader._base_url == "http://myhost:5000"

    def test_should_default_to_localhost_9418(self) -> None:
        loader = ApiLoader.local()
        assert loader._base_url == "http://localhost:9418"

    def test_should_not_set_api_key_or_app_id(self) -> None:
        loader = ApiLoader.local()
        assert loader._api_key is None
        assert loader._app_id is None

    def test_should_strip_trailing_slash(self) -> None:
        loader = ApiLoader.local(base_url="http://localhost:9418/")
        assert loader._base_url == "http://localhost:9418"


# ---------------------------------------------------------------------------
# _fetch_request
# ---------------------------------------------------------------------------


def _make_response(
    status_code: int = 200,
    json_data: dict | None = None,
    text: str = "",
) -> httpx.Response:
    """Create a fake httpx.Response."""
    if json_data is not None:
        content = json.dumps(json_data).encode()
        headers = {"content-type": "application/json"}
    else:
        content = text.encode()
        headers = {"content-type": "text/plain"}
    return httpx.Response(
        status_code=status_code,
        content=content,
        headers=headers,
        request=httpx.Request("GET", "https://fake"),
    )


class TestFetchRequest:
    """Tests for ApiLoader._fetch_request."""

    async def test_should_construct_correct_url_with_query_params(self) -> None:
        loader = ApiLoader.cloud(
            api_key="key", app_id="app", base_url="https://api.example.com"
        )
        mock_response = _make_response(
            json_data={"data": {"name": "test"}}
        )

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "my/prompt.mdx", "promptKind": "text"})

            instance.get.assert_called_once()
            call_kwargs = instance.get.call_args
            assert call_kwargs.kwargs["params"] == {
                "path": "my/prompt.mdx",
                "promptKind": "text",
            }
            assert f"https://api.example.com/{AGENTMARK_TEMPLATE_ENDPOINT}" in str(
                call_kwargs.args[0] if call_kwargs.args else call_kwargs.kwargs.get("url", call_kwargs[0][0])
            )

    async def test_should_include_app_id_header_in_cloud_mode(self) -> None:
        loader = ApiLoader.cloud(
            api_key="my-key", app_id="my-app", base_url="https://api.example.com"
        )
        mock_response = _make_response(json_data={"data": {}})

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "test"})

            headers = instance.get.call_args.kwargs["headers"]
            assert headers["X-Agentmark-App-Id"] == "my-app"

    async def test_should_include_authorization_header_in_cloud_mode(self) -> None:
        loader = ApiLoader.cloud(
            api_key="bearer-token", app_id="my-app", base_url="https://api.example.com"
        )
        mock_response = _make_response(json_data={"data": {}})

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "test"})

            headers = instance.get.call_args.kwargs["headers"]
            assert headers["Authorization"] == "bearer-token"

    async def test_should_not_include_auth_headers_in_local_mode(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(json_data={"data": {}})

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "test"})

            headers = instance.get.call_args.kwargs["headers"]
            assert "X-Agentmark-App-Id" not in headers
            assert "Authorization" not in headers

    async def test_should_set_accept_ndjson_for_stream_requests(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(text='{"input": {"x": 1}}\n')

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "test"}, stream=True)

            headers = instance.get.call_args.kwargs["headers"]
            assert headers["Accept"] == "application/x-ndjson"

    async def test_should_not_set_accept_ndjson_for_non_stream_requests(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(json_data={"data": {}})

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "test"}, stream=False)

            headers = instance.get.call_args.kwargs["headers"]
            assert "Accept" not in headers

    async def test_should_return_data_field_from_json_response(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(
            json_data={"data": {"name": "my-prompt", "config": {}}}
        )

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await loader._fetch_request({"path": "test"})

        assert result == {"name": "my-prompt", "config": {}}

    async def test_should_return_raw_text_for_stream_response(self) -> None:
        loader = ApiLoader.local()
        ndjson_text = '{"input": {"x": 1}}\n{"input": {"x": 2}}\n'
        mock_response = _make_response(text=ndjson_text)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await loader._fetch_request({"path": "test"}, stream=True)

        assert result == ndjson_text

    async def test_should_raise_value_error_on_api_error_with_json_body(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(
            status_code=404, json_data={"error": "Template not found"}
        )

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="Template not found"):
                await loader._fetch_request({"path": "missing"})

    async def test_should_raise_value_error_on_api_error_with_plain_text_body(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(status_code=500, text="Internal Server Error")

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="API error: 500"):
                await loader._fetch_request({"path": "broken"})

    async def test_should_set_timeout_to_30_seconds(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(json_data={"data": {}})

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader._fetch_request({"path": "test"})

            assert instance.get.call_args.kwargs["timeout"] == 30.0


# ---------------------------------------------------------------------------
# load_dataset
# ---------------------------------------------------------------------------


class TestLoadDataset:
    """Tests for ApiLoader.load_dataset."""

    async def test_should_fetch_dataset_from_api_endpoint(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"input": {"q": "hello"}}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            stream = await loader.load_dataset("datasets/test.jsonl")

            call_kwargs = instance.get.call_args.kwargs
            assert call_kwargs["params"]["path"] == "datasets/test.jsonl"
            assert call_kwargs["headers"]["Accept"] == "application/x-ndjson"

        assert isinstance(stream, ApiDatasetStream)

    async def test_should_parse_ndjson_response_into_items(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"input": {"q": "a"}}\n{"input": {"q": "b"}}\n{"input": {"q": "c"}}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            stream = await loader.load_dataset("datasets/test.jsonl")

        reader = stream.get_reader()
        items = []
        while True:
            chunk = await reader.read()
            if chunk["done"]:
                break
            items.append(chunk["value"])

        assert len(items) == 3
        assert items[0]["input"]["q"] == "a"
        assert items[1]["input"]["q"] == "b"
        assert items[2]["input"]["q"] == "c"

    async def test_should_return_dataset_stream_with_correct_items(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"input": {"x": 1}}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            stream = await loader.load_dataset("ds.jsonl")

        reader = stream.get_reader()
        first = await reader.read()
        assert first == {"done": False, "value": {"input": {"x": 1}}}
        second = await reader.read()
        assert second == {"done": True}

    async def test_should_send_auth_headers_in_cloud_mode(self) -> None:
        loader = ApiLoader.cloud(
            api_key="my-key", app_id="my-app", base_url="https://api.example.com"
        )
        ndjson = '{"input": {"q": "test"}}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader.load_dataset("ds.jsonl")

            headers = instance.get.call_args.kwargs["headers"]
            assert headers["Authorization"] == "my-key"
            assert headers["X-Agentmark-App-Id"] == "my-app"

    async def test_should_not_send_auth_headers_in_local_mode(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"input": {"q": "test"}}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            await loader.load_dataset("ds.jsonl")

            headers = instance.get.call_args.kwargs["headers"]
            assert "Authorization" not in headers
            assert "X-Agentmark-App-Id" not in headers

    async def test_should_raise_value_error_for_empty_dataset(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(text="")

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="empty or contains no valid rows"):
                await loader.load_dataset("empty.jsonl")

    async def test_should_raise_value_error_for_rows_missing_input_field(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"output": "no input here"}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="missing or invalid 'input' field"):
                await loader.load_dataset("bad.jsonl")

    async def test_should_raise_value_error_when_input_is_not_a_dict(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"input": "a string, not a dict"}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="missing or invalid 'input' field"):
                await loader.load_dataset("bad.jsonl")

    async def test_should_handle_json_array_response(self) -> None:
        loader = ApiLoader.local()
        # A single NDJSON line that is a JSON array
        ndjson = '[{"input": {"a": 1}}, {"input": {"a": 2}}]\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            stream = await loader.load_dataset("array.jsonl")

        reader = stream.get_reader()
        items = []
        while True:
            chunk = await reader.read()
            if chunk["done"]:
                break
            items.append(chunk["value"])

        assert len(items) == 2
        assert items[0]["input"]["a"] == 1
        assert items[1]["input"]["a"] == 2

    async def test_should_handle_response_as_list_type(self) -> None:
        """When _fetch_request returns a Python list (not a string), load_dataset handles it."""
        loader = ApiLoader.local()
        # Mock _fetch_request to return a list directly (the isinstance(response, list) branch)
        dataset_items = [{"input": {"x": 1}}, {"input": {"x": 2}}]

        with patch.object(loader, "_fetch_request", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = dataset_items

            stream = await loader.load_dataset("list-response.jsonl")

        reader = stream.get_reader()
        items = []
        while True:
            chunk = await reader.read()
            if chunk["done"]:
                break
            items.append(chunk["value"])

        assert len(items) == 2
        assert items[0]["input"]["x"] == 1

    async def test_should_skip_blank_lines_in_ndjson(self) -> None:
        loader = ApiLoader.local()
        ndjson = '{"input": {"q": "a"}}\n\n  \n{"input": {"q": "b"}}\n'
        mock_response = _make_response(text=ndjson)

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            stream = await loader.load_dataset("with-blanks.jsonl")

        reader = stream.get_reader()
        items = []
        while True:
            chunk = await reader.read()
            if chunk["done"]:
                break
            items.append(chunk["value"])

        assert len(items) == 2

    async def test_should_raise_for_only_whitespace_response(self) -> None:
        loader = ApiLoader.local()
        mock_response = _make_response(text="   \n  \n  ")

        with patch("agentmark.prompt_core.api_loader.httpx.AsyncClient") as MockClient:
            instance = AsyncMock()
            instance.get = AsyncMock(return_value=mock_response)
            MockClient.return_value.__aenter__ = AsyncMock(return_value=instance)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="empty or contains no valid rows"):
                await loader.load_dataset("whitespace.jsonl")


# ---------------------------------------------------------------------------
# load (prompt loading)
# ---------------------------------------------------------------------------


class TestLoad:
    """Tests for ApiLoader.load."""

    async def test_should_pass_path_and_prompt_kind_to_fetch_request(self) -> None:
        loader = ApiLoader.local()

        with patch.object(loader, "_fetch_request", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = {"name": "test-prompt"}

            result = await loader.load("prompts/test.mdx", "text")

            mock_fetch.assert_called_once_with(
                {"path": "prompts/test.mdx", "promptKind": "text"}
            )
            assert result == {"name": "test-prompt"}

    async def test_should_return_api_response_data(self) -> None:
        loader = ApiLoader.local()
        expected = {"name": "my-prompt", "children": []}

        with patch.object(loader, "_fetch_request", new_callable=AsyncMock) as mock_fetch:
            mock_fetch.return_value = expected

            result = await loader.load("p.mdx", "object")

        assert result is expected


# ---------------------------------------------------------------------------
# ApiDatasetReader
# ---------------------------------------------------------------------------


class TestApiDatasetReader:
    """Tests for ApiDatasetReader."""

    async def test_should_return_items_sequentially(self) -> None:
        items = [{"input": {"a": 1}}, {"input": {"a": 2}}, {"input": {"a": 3}}]
        reader = ApiDatasetReader(items)

        first = await reader.read()
        assert first == {"done": False, "value": {"input": {"a": 1}}}

        second = await reader.read()
        assert second == {"done": False, "value": {"input": {"a": 2}}}

        third = await reader.read()
        assert third == {"done": False, "value": {"input": {"a": 3}}}

    async def test_should_return_done_true_when_exhausted(self) -> None:
        reader = ApiDatasetReader([{"input": {"x": 1}}])

        await reader.read()
        result = await reader.read()

        assert result == {"done": True}

    async def test_should_return_done_true_for_empty_items(self) -> None:
        reader = ApiDatasetReader([])

        result = await reader.read()

        assert result == {"done": True}

    async def test_should_keep_returning_done_after_exhaustion(self) -> None:
        reader = ApiDatasetReader([{"input": {"x": 1}}])

        await reader.read()  # item
        await reader.read()  # done
        result = await reader.read()  # still done

        assert result == {"done": True}


# ---------------------------------------------------------------------------
# ApiDatasetStream
# ---------------------------------------------------------------------------


class TestApiDatasetStream:
    """Tests for ApiDatasetStream."""

    def test_should_return_reader_instance(self) -> None:
        stream = ApiDatasetStream([{"input": {"x": 1}}])
        reader = stream.get_reader()
        assert isinstance(reader, ApiDatasetReader)

    async def test_reader_should_iterate_over_stream_items(self) -> None:
        items = [{"input": {"x": 1}}, {"input": {"x": 2}}]
        stream = ApiDatasetStream(items)
        reader = stream.get_reader()

        collected = []
        while True:
            chunk = await reader.read()
            if chunk["done"]:
                break
            collected.append(chunk["value"])

        assert collected == items

    def test_should_create_independent_readers(self) -> None:
        """Each get_reader() call should create a new reader with its own index."""
        items = [{"input": {"x": 1}}, {"input": {"x": 2}}]
        stream = ApiDatasetStream(items)

        reader1 = stream.get_reader()
        reader2 = stream.get_reader()

        assert reader1 is not reader2
