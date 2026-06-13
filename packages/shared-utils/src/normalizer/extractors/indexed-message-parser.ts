import { Message, StandardMessageContent, ToolCall } from '../types';

/**
 * Shared parser for the "flattened indexed message" attribute shape used by
 * both OpenInference and OpenLLMetry/Traceloop. Neither emits a single JSON
 * messages array (the way OTel GenAI v1.37+ does with `gen_ai.input.messages`);
 * instead they explode each message into one attribute per field, indexed by
 * position:
 *
 *   OpenInference:
 *     llm.input_messages.0.message.role                 = "user"
 *     llm.input_messages.0.message.content              = "hello"
 *     llm.output_messages.0.message.tool_calls.0.tool_call.function.name = "search"
 *     llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments = "{...}"
 *
 *   OpenLLMetry / Traceloop:
 *     gen_ai.prompt.0.role                              = "user"
 *     gen_ai.prompt.0.content                           = "hello"
 *     gen_ai.completion.0.tool_calls.0.name             = "search"
 *     gen_ai.completion.0.tool_calls.0.arguments        = "{...}"
 *
 * The two differ only in path fragments (a `message.` infix, a `tool_call.`
 * infix, `function.name` vs `name`), so one config-driven parser serves both.
 */
export interface IndexedMessageConfig {
    /** Attribute prefix that precedes the integer index, e.g. "llm.input_messages". */
    prefix: string;
    /** Path fragment between the index and the per-message fields. OpenInference uses
     *  "message." (so keys read `…0.message.role`); OpenLLMetry uses "" (`…0.role`). */
    messageInfix: string;
    /** Field name for the role. Default "role". */
    roleKey?: string;
    /** Field name for scalar text content. Default "content". */
    contentKey?: string;
    /** Multi-part content list field (OpenInference `contents`), read when the scalar
     *  content field is absent. Each part lives at
     *  `${base}${contentsKey}.${j}.${contentsPartInfix}text`. Omit to disable. */
    contentsKey?: string;
    /** Path fragment after the contents index, e.g. "message_content." for OpenInference. */
    contentsPartInfix?: string;
    /** Tool-call sub-shape. Omit if the source never carries tool calls. */
    toolCalls?: {
        /** Array field name under a message, e.g. "tool_calls". */
        arrayKey: string;
        /** Fragment between the tool-call index and its fields. OpenInference uses
         *  "tool_call." ; OpenLLMetry uses "". */
        infix: string;
        /** Relative key to the call id, e.g. "id". */
        idKey: string;
        /** Relative key to the tool name. OpenInference "function.name"; OpenLLMetry "name". */
        nameKey: string;
        /** Relative key to the JSON-string arguments. OpenInference "function.arguments";
         *  OpenLLMetry "arguments". */
        argsKey: string;
    };
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Collect the distinct, ascending integer indices that appear immediately after
 * `prefix.` across the attribute keys. Tolerant of gaps and arbitrary key order
 * (a span may emit message 2 before message 0); we never assume a dense 0..n.
 * Exported so transformers can reuse it for non-message indexed groups
 * (e.g. OpenInference `retrieval.documents.{i}.*`).
 */
export function collectIndices(attributes: Record<string, any>, prefix: string): number[] {
    const re = new RegExp(`^${escapeRegExp(prefix)}\\.(\\d+)\\.`);
    const seen = new Set<number>();
    for (const key of Object.keys(attributes)) {
        const match = re.exec(key);
        if (match) seen.add(Number(match[1]));
    }
    return [...seen].sort((a, b) => a - b);
}

/** Parse a JSON-string arguments value into an object, mirroring the convention
 *  used elsewhere (parse; on failure keep the raw text under `raw`). */
function parseArgs(raw: any): Record<string, any> {
    if (raw === undefined || raw === null) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : { raw };
        } catch {
            return { raw };
        }
    }
    return { raw };
}

/** Read the tool calls attached to the message rooted at `messageBase`. */
function readMessageToolCalls(
    attributes: Record<string, any>,
    messageBase: string,
    config: IndexedMessageConfig,
): ToolCall[] {
    const tc = config.toolCalls;
    if (!tc) return [];
    const arrayPrefix = `${messageBase}${tc.arrayKey}`;
    const indices = collectIndices(attributes, arrayPrefix);
    const calls: ToolCall[] = [];
    for (const j of indices) {
        const base = `${arrayPrefix}.${j}.${tc.infix}`;
        const name = attributes[`${base}${tc.nameKey}`];
        if (name === undefined) continue;
        const id = attributes[`${base}${tc.idKey}`];
        const args = parseArgs(attributes[`${base}${tc.argsKey}`]);
        calls.push({
            type: 'tool-call',
            toolCallId: id !== undefined ? String(id) : '',
            toolName: String(name),
            args,
        });
    }
    return calls;
}

/** Join the multi-part `contents` list of a message into text, when present. */
function readContentsText(
    attributes: Record<string, any>,
    messageBase: string,
    config: IndexedMessageConfig,
): string | undefined {
    if (!config.contentsKey) return undefined;
    const contentsPrefix = `${messageBase}${config.contentsKey}`;
    const indices = collectIndices(attributes, contentsPrefix);
    if (indices.length === 0) return undefined;
    const partInfix = config.contentsPartInfix ?? '';
    const parts: string[] = [];
    for (const j of indices) {
        const text = attributes[`${contentsPrefix}.${j}.${partInfix}text`];
        if (typeof text === 'string' && text.length > 0) parts.push(text);
    }
    return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Parse the flattened indexed messages under `config.prefix` into normalized
 * Messages. A message that carries tool calls gets an array content of a text
 * part (when present) followed by `tool-call` parts, so conversation history is
 * preserved with full fidelity; a text-only message gets a plain string content.
 * Returns `undefined` when no messages are present (lets callers fall through to
 * other extraction paths).
 */
export function parseIndexedMessages(
    attributes: Record<string, any>,
    config: IndexedMessageConfig,
): Message[] | undefined {
    const indices = collectIndices(attributes, config.prefix);
    if (indices.length === 0) return undefined;

    const roleKey = config.roleKey ?? 'role';
    const contentKey = config.contentKey ?? 'content';
    const messages: Message[] = [];

    for (const i of indices) {
        // `i` is always a decimal integer (collectIndices matches /^\d+\./), so
        // the constructed key is never a prototype-pollution vector and the
        // attribute lookups below are reads, not writes.
        const base = `${config.prefix}.${i}.${config.messageInfix}`;

        const role = attributes[`${base}${roleKey}`];
        const scalarContent = attributes[`${base}${contentKey}`];
        const text =
            typeof scalarContent === 'string'
                ? scalarContent
                : scalarContent !== undefined
                  ? String(scalarContent)
                  : readContentsText(attributes, base, config);
        const toolCalls = readMessageToolCalls(attributes, base, config);

        // Skip wholly empty positions (no role, no text, no tool calls).
        if (role === undefined && text === undefined && toolCalls.length === 0) continue;

        let content: StandardMessageContent | StandardMessageContent[];
        if (toolCalls.length > 0) {
            const parts: StandardMessageContent[] = [];
            if (text) parts.push({ type: 'text', text });
            for (const call of toolCalls) {
                parts.push({
                    type: 'tool-call',
                    toolCallId: call.toolCallId,
                    toolName: call.toolName,
                    args: call.args,
                });
            }
            content = parts;
        } else {
            content = text ?? '';
        }

        messages.push({ role: role !== undefined ? String(role) : 'user', content });
    }

    return messages.length > 0 ? messages : undefined;
}

/**
 * Flatten every tool call across the indexed messages under `config.prefix` into
 * a span-level ToolCall[]. Used for the response side, where OpenInference and
 * OpenLLMetry place the assistant's tool calls inside `output_messages` /
 * `gen_ai.completion` and AgentMark surfaces them as `span.toolCalls`.
 */
export function extractIndexedToolCalls(
    attributes: Record<string, any>,
    config: IndexedMessageConfig,
): ToolCall[] | undefined {
    if (!config.toolCalls) return undefined;
    const indices = collectIndices(attributes, config.prefix);
    const calls: ToolCall[] = [];
    for (const i of indices) {
        const base = `${config.prefix}.${i}.${config.messageInfix}`;
        calls.push(...readMessageToolCalls(attributes, base, config));
    }
    return calls.length > 0 ? calls : undefined;
}

/**
 * Collapse normalized messages into a single plain-text string (text parts only,
 * newline-joined). Tool-call parts are intentionally dropped — they travel
 * separately via `extractIndexedToolCalls`. Returns `undefined` when there is no
 * text to show.
 */
export function messagesToPlainText(messages: Message[] | undefined): string | undefined {
    if (!messages || messages.length === 0) return undefined;
    const chunks: string[] = [];
    for (const msg of messages) {
        if (typeof msg.content === 'string') {
            if (msg.content.length > 0) chunks.push(msg.content);
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (typeof part === 'string') {
                    if (part.length > 0) chunks.push(part);
                } else if (part.type === 'text' && part.text.length > 0) {
                    chunks.push(part.text);
                }
            }
        }
    }
    return chunks.length > 0 ? chunks.join('\n') : undefined;
}
