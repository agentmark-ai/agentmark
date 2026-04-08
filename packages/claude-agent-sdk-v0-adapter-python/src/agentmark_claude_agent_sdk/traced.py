"""Tracing wrapper and SDK execution layer for Claude Agent SDK queries.

Mirrors the TypeScript traced/index.ts in @agentmark-ai/claude-agent-sdk-v0-adapter.
Handles SDK execution (ClaudeSDKClient lifecycle), OTEL env stripping,
hook merging, and automatic tracing — keeping the webhook handler thin.

Example:
    from agentmark_claude_agent_sdk.traced import traced_query

    adapted = await prompt.format(props=my_props, telemetry={"isEnabled": True})
    async for message in traced_query(adapted):
        if type(message).__name__ == "ResultMessage":
            result = parse(message)

Span structure (following OTEL GenAI semantic conventions):
    invoke_agent {promptName} (parent)
      chat {model} (per LLM turn, GENERATION type)
        execute_tool {tool_name} (per tool call)
"""

from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from .hooks.otel_hooks import TRACER_SCOPE_NAME


# ---------------------------------------------------------------------------
# OTEL env vars to strip from the CLI subprocess to prevent duplicate spans.
# The adapter handles all tracing by intercepting the message stream.
# ---------------------------------------------------------------------------

_OTEL_ENV_VARS_TO_STRIP = frozenset({
    "CLAUDE_CODE_ENABLE_TELEMETRY",
    "OTEL_TRACES_EXPORTER",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_EXPORTER_OTLP_TRACES_PROTOCOL",
})


# ---------------------------------------------------------------------------
# OTEL helpers
# ---------------------------------------------------------------------------

def get_otel_api() -> Any | None:
    """Get OpenTelemetry trace API if available."""
    try:
        from opentelemetry import trace
        return trace
    except ImportError:
        return None


def _get_tracer() -> Any | None:
    """Get an OTEL tracer if OpenTelemetry is initialized."""
    otel = get_otel_api()
    if otel is None:
        return None
    return otel.get_tracer(TRACER_SCOPE_NAME)


def generate_fallback_trace_id() -> str:
    """Generate a fallback trace ID when OTEL is not available."""
    return uuid.uuid4().hex



# ---------------------------------------------------------------------------
# _TracingContext — manages OTEL span hierarchy for a traced query
# ---------------------------------------------------------------------------

class _TracingContext:
    """Manages OTEL span hierarchy for a traced query execution.

    Follows the TypeScript withTracing() pattern:
    - invoke_agent (root) → chat {model} (per LLM turn) → execute_tool (per tool)
    """

    def __init__(
        self,
        tracer: Any,
        prompt_name: str,
        prompt_text: str,
        model: str | None = None,
        system_prompt: str | None = None,
    ) -> None:
        from opentelemetry import context as otel_context
        from opentelemetry import trace as otel_trace

        self.tracer = tracer
        self._trace_mod = otel_trace
        self._context_mod = otel_context
        self.agent_span: Any = None
        self.parent_context: Any = None
        self.current_chat_span: Any = None
        self.current_chat_context: Any = None
        self.pending_tool_spans: dict[str, Any] = {}
        self.turn_number = 0
        self.model = model
        # Accumulated conversation history for each chat span's input
        self._messages: list[dict[str, Any]] = []
        if system_prompt:
            self._messages.append({"role": "system", "content": system_prompt})
        if prompt_text:
            self._messages.append({"role": "user", "content": prompt_text})

        # Create root invoke_agent span
        span_name = f"invoke_agent {prompt_name}" if prompt_name else "invoke_agent"
        attrs = {
            "gen_ai.operation.name": "invoke_agent",
            "agentmark.prompt_name": prompt_name,
            "agentmark.trace_name": prompt_name,
        }
        if model:
            attrs["gen_ai.request.model"] = model
        if system_prompt:
            attrs["agentmark.system_prompt"] = system_prompt[:4000]

        self.agent_span = tracer.start_span(span_name, attributes=attrs)
        self.parent_context = otel_trace.set_span_in_context(self.agent_span)

    @property
    def trace_id(self) -> str:
        ctx = self.agent_span.get_span_context()
        return format(ctx.trace_id, "032x")

    @staticmethod
    def _serialize_messages(
        messages: list[dict[str, Any]],
        max_total: int = 64000,
        max_per_msg: int = 4000,
    ) -> str:
        """Serialize messages with per-message content truncation."""
        truncated = []
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str) and len(content) > max_per_msg:
                content = content[:max_per_msg] + f"... [truncated {len(content) - max_per_msg} chars]"
            truncated.append({**msg, "content": content})
        return json.dumps(truncated)[:max_total]

    def _end_current_chat(self) -> None:
        if self.current_chat_span:
            try:
                from opentelemetry.trace import StatusCode
                self.current_chat_span.set_status(StatusCode.OK)
            except Exception:
                pass
            self.current_chat_span.end()
            self.current_chat_span = None
            self.current_chat_context = None

    def _end_pending_tools(self) -> None:
        """End any pending tool spans that never received a PostToolUse hook."""
        if not self.pending_tool_spans:
            return
        for span in self.pending_tool_spans.values():
            try:
                from opentelemetry.trace import StatusCode
                span.set_status(StatusCode.ERROR, "Tool error (no PostToolUse)")
            except Exception:
                pass
            span.end()
        self.pending_tool_spans.clear()

    def process_assistant_message(self, message: Any) -> None:
        """Create a chat span for an LLM turn (GENERATION type)."""
        self._end_pending_tools()
        self._end_current_chat()
        self.turn_number += 1

        msg_model = getattr(message, "model", "") or ""
        if msg_model and not self.model:
            self.model = msg_model
            self.agent_span.set_attribute("gen_ai.request.model", msg_model)

        model = self.model or msg_model
        content = getattr(message, "content", []) or []

        text_parts = []
        tool_parts = []
        for block in content:
            btype = type(block).__name__
            if btype == "TextBlock":
                text_parts.append(getattr(block, "text", ""))
            elif btype == "ToolUseBlock":
                name = getattr(block, "name", "")
                inp = getattr(block, "input", {})
                try:
                    tool_parts.append(f"[Tool: {name}] {json.dumps(inp)}")
                except (TypeError, ValueError):
                    tool_parts.append(f"[Tool: {name}]")

        span_name = f"chat {model}" if model else "chat"
        attrs: dict[str, Any] = {
            "gen_ai.operation.name": "chat",
            "gen_ai.turn.number": self.turn_number,
        }
        if model:
            attrs["gen_ai.request.model"] = model

        if self._messages:
            attrs["gen_ai.request.input"] = self._serialize_messages(self._messages)

        output_parts = text_parts + tool_parts
        if output_parts:
            attrs["gen_ai.response.output"] = "\n".join(output_parts)[:4000]

        self.current_chat_span = self.tracer.start_span(
            span_name, attributes=attrs, context=self.parent_context
        )
        self.current_chat_context = self._trace_mod.set_span_in_context(
            self.current_chat_span, self.parent_context
        )

        # Append this assistant turn to conversation history
        assistant_content = text_parts + tool_parts
        if assistant_content:
            self._messages.append({"role": "assistant", "content": "\n".join(assistant_content)})

    def process_result_message(self, message: Any) -> None:
        """Complete the agent span with final usage data."""
        self._end_current_chat()
        self._end_pending_tools()

        _set_result_on_span(self.agent_span, message)

        if self.model:
            self.agent_span.set_attribute("gen_ai.response.model", self.model)

        self.agent_span.end()

    def create_tool_hooks(self) -> dict[str, list[dict[str, Any]]]:
        """Create SDK hooks for tool span tracing (PreToolUse/PostToolUse)."""
        ctx = self
        session_id_captured = False

        async def pre_tool_use(
            input_data: dict[str, Any],
            tool_use_id: str | None,
            _options: dict[str, Any],
        ) -> dict[str, Any]:
            nonlocal session_id_captured
            if not session_id_captured:
                sid = input_data.get("session_id")
                if sid:
                    ctx.agent_span.set_attribute("agentmark.session_id", str(sid))
                    session_id_captured = True

            if not tool_use_id:
                return {}

            tool_name = str(input_data.get("tool_name", "")) if input_data.get("tool_name") else None
            span_name = f"execute_tool {tool_name}" if tool_name else "execute_tool"
            attrs: dict[str, Any] = {"gen_ai.operation.name": "execute_tool"}
            if tool_name:
                attrs["gen_ai.tool.name"] = tool_name
            attrs["gen_ai.tool.call.id"] = tool_use_id

            tool_input = input_data.get("tool_input")
            if tool_input is not None:
                try:
                    attrs["gen_ai.tool.input"] = json.dumps(tool_input)[:4000]
                except (TypeError, ValueError):
                    attrs["gen_ai.tool.input"] = str(tool_input)[:4000]

            parent = ctx.current_chat_context or ctx.parent_context
            tool_span = ctx.tracer.start_span(span_name, attributes=attrs, context=parent)
            ctx.pending_tool_spans[tool_use_id] = tool_span
            return {}

        async def post_tool_use(
            input_data: dict[str, Any],
            tool_use_id: str | None,
            _options: dict[str, Any],
        ) -> dict[str, Any]:
            if not tool_use_id:
                return {}

            tool_span = ctx.pending_tool_spans.pop(tool_use_id, None)
            if tool_span:
                tool_response = input_data.get("tool_response")
                if tool_response is not None:
                    try:
                        tool_span.set_attribute("gen_ai.tool.output", json.dumps(tool_response)[:4000])
                    except (TypeError, ValueError):
                        tool_span.set_attribute("gen_ai.tool.output", str(tool_response)[:4000])
                try:
                    from opentelemetry.trace import StatusCode
                    tool_span.set_status(StatusCode.OK)
                except Exception:
                    pass
                tool_span.end()

                # Append tool result to conversation history
                tool_name = str(input_data.get("tool_name", ""))
                result_text = ""
                if tool_response is not None:
                    try:
                        result_text = json.dumps(tool_response)[:2000]
                    except (TypeError, ValueError):
                        result_text = str(tool_response)[:2000]
                ctx._messages.append({
                    "role": "tool",
                    "name": tool_name,
                    "content": result_text,
                })
            return {}

        try:
            from claude_agent_sdk import HookMatcher
            return {
                "PreToolUse": [HookMatcher(hooks=[pre_tool_use])],
                "PostToolUse": [HookMatcher(hooks=[post_tool_use])],
            }
        except ImportError:
            return {
                "PreToolUse": [{"hooks": [pre_tool_use]}],
                "PostToolUse": [{"hooks": [post_tool_use]}],
            }


# ---------------------------------------------------------------------------
# Internal: extract telemetry fields from adapted
# ---------------------------------------------------------------------------

def _extract_telemetry(adapted: Any) -> tuple[str, str | None, str | None, dict[str, Any] | None, Any]:
    """Extract (prompt_name, model, system_prompt, props, telemetry) from adapted."""
    query_params = getattr(adapted, "query", None)
    options = getattr(query_params, "options", None) if query_params else None
    telemetry = getattr(adapted, "telemetry", None)

    prompt_name = ""
    model: str | None = None
    system_prompt: str | None = None
    props: dict[str, Any] | None = None

    if telemetry is not None:
        prompt_name = getattr(telemetry, "prompt_name", None) or getattr(telemetry, "promptName", None) or ""
        model = getattr(telemetry, "model", None)
        props = getattr(telemetry, "props", None)
        system_prompt = getattr(telemetry, "system_prompt", None) or getattr(telemetry, "systemPrompt", None)

    # Fall back to options.model
    if model is None and options is not None:
        model = getattr(options, "model", None)

    return prompt_name, model, system_prompt, props, telemetry


def _set_result_on_span(span: Any, message: Any) -> None:
    """Set output, usage, and cost attributes on a span from a ResultMessage.

    Used to capture the final result on the parent invoke_agent span.
    """
    result = getattr(message, "result", "") or ""
    structured = getattr(message, "structured_output", None)
    usage = getattr(message, "usage", {}) or {}
    cost = getattr(message, "total_cost_usd", None)
    duration = getattr(message, "duration_ms", None)
    session_id = getattr(message, "session_id", None)
    subtype = getattr(message, "subtype", "")

    if structured is not None:
        try:
            span.set_attribute("gen_ai.response.output", json.dumps(structured)[:4000])
        except (TypeError, ValueError):
            if result:
                span.set_attribute("gen_ai.response.output", result[:4000])
    elif result:
        span.set_attribute("gen_ai.response.output", result[:4000])

    input_tokens = usage.get("input_tokens", 0)
    output_tokens = usage.get("output_tokens", 0)
    if input_tokens:
        span.set_attribute("gen_ai.usage.input_tokens", input_tokens)
    if output_tokens:
        span.set_attribute("gen_ai.usage.output_tokens", output_tokens)
    if cost is not None:
        span.set_attribute("agentmark.usage.cost_usd", cost)
    if duration is not None:
        span.set_attribute("gen_ai.duration_ms", duration)
    if session_id:
        span.set_attribute("agentmark.session_id", session_id)

    try:
        from opentelemetry.trace import StatusCode
        if subtype == "success":
            span.set_status(StatusCode.OK)
        else:
            span.set_status(StatusCode.ERROR, f"Query failed: {subtype}")
    except Exception:
        pass


def _set_telemetry_attributes(ctx: _TracingContext, props: dict[str, Any] | None, telemetry: Any) -> None:
    """Set props and metadata attributes on the invoke_agent span."""
    if props:
        try:
            ctx.agent_span.set_attribute("agentmark.props", json.dumps(props))
        except (TypeError, ValueError):
            pass

    if telemetry is not None:
        metadata = getattr(telemetry, "metadata", None)
        if metadata and isinstance(metadata, dict):
            for key, value in metadata.items():
                if value is not None:
                    attr_key = f"agentmark.metadata.{key}"
                    if isinstance(value, (str, int, float, bool)):
                        ctx.agent_span.set_attribute(attr_key, value)
                    else:
                        try:
                            ctx.agent_span.set_attribute(attr_key, json.dumps(value))
                        except (TypeError, ValueError):
                            ctx.agent_span.set_attribute(attr_key, str(value))



# ---------------------------------------------------------------------------
# SDK execution — converts adapted options to ClaudeAgentOptions and runs query
# ---------------------------------------------------------------------------

def _build_sdk_options(
    options: Any,
    *,
    default_mcp_servers: dict[str, Any] | None = None,
) -> Any:
    """Convert ClaudeAgentQueryOptions to ClaudeAgentOptions for the SDK.

    Handles model prefix stripping, MCP server merging, OTEL env var
    stripping, and all field mappings. Mirrors the TypeScript
    mergeHooksIntoOptions() in traced/index.ts.
    """
    from claude_agent_sdk import ClaudeAgentOptions

    # If options is already a ClaudeAgentOptions instance (e.g. caller built it
    # directly), just merge default MCP servers and OTEL env stripping — don't
    # re-convert field by field.
    if isinstance(options, ClaudeAgentOptions):
        if default_mcp_servers:
            existing = options.mcp_servers or {}
            merged = dict(default_mcp_servers)
            if isinstance(existing, dict):
                merged.update(existing)
            else:
                merged = existing
            options.mcp_servers = merged
        if _OTEL_ENV_VARS_TO_STRIP & os.environ.keys():
            options.env = {
                k: v for k, v in os.environ.items()
                if k not in _OTEL_ENV_VARS_TO_STRIP
            }
        return options

    kwargs: dict[str, Any] = {}

    if hasattr(options, "model") and options.model:
        # Strip provider prefix (e.g. "anthropic/claude-haiku-3-5-20241022")
        model = options.model
        if "/" in model:
            model = model.split("/", 1)[1]
        kwargs["model"] = model
    if hasattr(options, "max_thinking_tokens") and options.max_thinking_tokens:
        kwargs["max_thinking_tokens"] = options.max_thinking_tokens
    if hasattr(options, "max_turns") and options.max_turns:
        kwargs["max_turns"] = options.max_turns
    if hasattr(options, "permission_mode") and options.permission_mode:
        kwargs["permission_mode"] = options.permission_mode
    if hasattr(options, "cwd") and options.cwd:
        kwargs["cwd"] = options.cwd
    if hasattr(options, "system_prompt") and options.system_prompt:
        kwargs["system_prompt"] = options.system_prompt
    if hasattr(options, "output_format") and options.output_format:
        of = options.output_format
        if isinstance(of, dict):
            kwargs["output_format"] = of
        else:
            kwargs["output_format"] = {
                "type": of.type,
                "schema": of.schema,
            }

    # Merge default MCP servers with prompt-configured ones
    mcp_servers = dict(default_mcp_servers) if default_mcp_servers else {}
    if hasattr(options, "mcp_servers") and options.mcp_servers:
        if isinstance(options.mcp_servers, dict):
            mcp_servers.update(options.mcp_servers)
        else:
            mcp_servers = options.mcp_servers
    if mcp_servers:
        kwargs["mcp_servers"] = mcp_servers

    if hasattr(options, "hooks") and options.hooks:
        kwargs["hooks"] = options.hooks
    if hasattr(options, "allowed_tools") and options.allowed_tools:
        kwargs["allowed_tools"] = options.allowed_tools
    if hasattr(options, "disallowed_tools") and options.disallowed_tools:
        kwargs["disallowed_tools"] = options.disallowed_tools

    # Only materialize env when OTEL vars are present — avoids snapshotting
    # the full environ when the subprocess would inherit it naturally.
    if _OTEL_ENV_VARS_TO_STRIP & os.environ.keys():
        kwargs["env"] = {
            k: v for k, v in os.environ.items()
            if k not in _OTEL_ENV_VARS_TO_STRIP
        }

    return ClaudeAgentOptions(**kwargs)


async def _execute_sdk_query(
    prompt: str,
    options: Any,
    *,
    default_mcp_servers: dict[str, Any] | None = None,
) -> AsyncGenerator[Any, None]:
    """Execute a Claude Agent SDK query via ClaudeSDKClient.

    Converts ClaudeAgentQueryOptions to ClaudeAgentOptions, manages
    the client lifecycle, and yields SDK messages.
    """
    try:
        from claude_agent_sdk import ClaudeSDKClient
    except ImportError:
        yield {"type": "result", "subtype": "success", "result": "Mock result"}
        return

    sdk_options = _build_sdk_options(options, default_mcp_servers=default_mcp_servers)

    # Workaround for SDK bug #386: prompt must be an async generator.
    # If the caller already wrapped the prompt (e.g. create_prompt_generator),
    # use it directly; otherwise wrap the string.
    if hasattr(prompt, "__aiter__"):
        prompt_gen = prompt
    else:
        async def prompt_gen_fn() -> AsyncGenerator[dict[str, Any], None]:
            yield {"type": "user", "message": {"role": "user", "content": prompt}}
        prompt_gen = prompt_gen_fn()

    async with ClaudeSDKClient(sdk_options) as client:
        await client.query(prompt_gen)
        async for message in client.receive_response():
            yield message


# ---------------------------------------------------------------------------
# traced_query — the public API
# ---------------------------------------------------------------------------

async def traced_query(
    adapted: Any,
    *,
    default_mcp_servers: dict[str, Any] | None = None,
) -> AsyncGenerator[Any, None]:
    """Wrap a Claude Agent SDK query with automatic OTEL tracing.

    Accepts the adapted output from prompt.format() directly — handles
    SDK execution internally via ClaudeSDKClient. All tracing context
    (prompt name, model, system prompt, props) is extracted from
    adapted.query and adapted.telemetry automatically.

    Mirrors the TypeScript withTracing(query, adapted) API in
    traced/index.ts, which receives the raw SDK query function and
    handles hook merging, OTEL env stripping, and execution.

    Args:
        adapted: Output from prompt.format() — has .query (prompt + options)
            and .telemetry (prompt name, model, props, etc.).
        default_mcp_servers: Default MCP servers to merge with
            prompt-configured ones.

    Yields:
        Messages from the SDK query, transparently.
    """
    # Extract query params
    query_params = getattr(adapted, "query", None)
    prompt = getattr(query_params, "prompt", "") if query_params else ""
    options = getattr(query_params, "options", None) if query_params else None

    prompt_name, model, system_prompt, props, telemetry = _extract_telemetry(adapted)

    # Try to initialize OTEL tracing
    otel = get_otel_api()
    tracer = _get_tracer()

    if tracer is None or otel is None:
        # No OTEL available — execute without tracing
        async for message in _execute_sdk_query(
            prompt, options, default_mcp_servers=default_mcp_servers
        ):
            yield message
        return

    from opentelemetry import context as otel_context

    # Resolve prompt text for the tracing context
    prompt_text = prompt if isinstance(prompt, str) else ""

    ctx = _TracingContext(
        tracer, prompt_name, prompt_text, model, system_prompt=system_prompt
    )

    _set_telemetry_attributes(ctx, props, telemetry)

    # Merge tracing tool hooks into options
    tracing_hooks = ctx.create_tool_hooks()
    if options is not None:
        _merge_hooks_into_options(options, tracing_hooks)

    # Run query inside the OTEL parent context so child spans nest correctly
    token = otel_context.attach(ctx.parent_context)
    agent_span_ended = False
    try:
        async for message in _execute_sdk_query(
            prompt, options, default_mcp_servers=default_mcp_servers
        ):
            msg_type = type(message).__name__

            if msg_type == "AssistantMessage":
                ctx.process_assistant_message(message)
            elif msg_type == "ResultMessage":
                ctx.process_result_message(message)
                agent_span_ended = True

            yield message
    except Exception as error:
        ctx._end_current_chat()
        ctx._end_pending_tools()
        try:
            from opentelemetry.trace import StatusCode
            ctx.agent_span.set_status(StatusCode.ERROR, str(error))
        except Exception:
            pass
        ctx.agent_span.end()
        agent_span_ended = True
        raise
    finally:
        otel_context.detach(token)
        ctx._end_current_chat()
        ctx._end_pending_tools()
        if not agent_span_ended:
            ctx.agent_span.end()


def _merge_hooks_into_options(
    options: Any,
    tracing_hooks: dict[str, list[Any]],
) -> None:
    """Merge tracing hooks into SDK options.hooks.

    PreToolUse hooks are prepended (tracing sees tool calls first),
    PostToolUse hooks are appended (tracing sees results last).
    """
    existing_hooks = getattr(options, "hooks", None) or {}
    merged: dict[str, list[Any]] = {}

    # Collect existing hooks
    if isinstance(existing_hooks, dict):
        for event_name, matchers in existing_hooks.items():
            merged[event_name] = list(matchers)

    # Add tracing hooks (PreToolUse first, PostToolUse last)
    for event_name, matchers in tracing_hooks.items():
        if event_name in merged:
            if event_name == "PreToolUse":
                merged[event_name] = matchers + merged[event_name]
            else:
                merged[event_name] = merged[event_name] + matchers
        else:
            merged[event_name] = matchers

    # Set on options
    try:
        options.hooks = merged
    except AttributeError:
        pass
