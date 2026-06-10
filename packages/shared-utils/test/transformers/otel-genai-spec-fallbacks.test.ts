/**
 * Tests for OTel GenAI semantic-convention fallback acceptance in the
 * normalizer (feat: otel-genai-spec-alignment).
 *
 * Contract under test: AgentMark keys ALWAYS win over the standard-spec
 * fallback keys — accepting the spec shapes is purely additive and existing
 * traffic is normalized byte-identically. Each fallback key is exercised
 * three ways: present alone (mapped), present alongside ours (ours wins),
 * and absent (field unchanged).
 *
 * Spec shape reference (https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/):
 *   gen_ai.input.messages / gen_ai.output.messages = JSON array of
 *   {role, parts: [{type:"text",content} | {type:"tool_call",id,name,arguments} | ...]}
 */
import { describe, it, expect } from 'vitest';
import { AgentMarkTransformer } from '../../src/normalizer/transformers/agentmark';
import { OtelGenAiTransformer } from '../../src/normalizer/transformers/otel-genai';
import { normalizeSpan } from '../../src/normalizer';
import { typeClassifier } from '../../src/normalizer/type-classifier';
import { SpanType, OtelSpan } from '../../src/normalizer/types';

const makeSpan = (name = 'chat claude-sonnet-4'): OtelSpan => ({
  traceId: 'trace-1',
  spanId: 'span-1',
  name,
  kind: 1,
  startTimeUnixNano: '1000000000',
  endTimeUnixNano: '2000000000',
});

const SPEC_INPUT_MESSAGES = JSON.stringify([
  { role: 'system', parts: [{ type: 'text', content: 'You are helpful.' }] },
  { role: 'user', parts: [{ type: 'text', content: 'Weather in Paris?' }] },
]);

const SPEC_OUTPUT_MESSAGES = JSON.stringify([
  {
    role: 'assistant',
    parts: [{ type: 'text', content: 'It is sunny.' }],
    finish_reason: 'stop',
  },
]);

const OUR_INPUT = JSON.stringify([{ role: 'user', content: 'our input' }]);

describe('AgentMarkTransformer — OTel GenAI spec fallbacks', () => {
  const transformer = new AgentMarkTransformer();

  describe('input fallbacks', () => {
    it('maps gen_ai.input.messages (spec parts shape) when our keys are absent', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.input.messages': SPEC_INPUT_MESSAGES,
      });
      expect(result.input).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Weather in Paris?' },
      ]);
    });

    it('prefers gen_ai.request.input over gen_ai.input.messages when both present', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.request.input': OUR_INPUT,
        'gen_ai.input.messages': SPEC_INPUT_MESSAGES,
      });
      expect(result.input).toEqual([{ role: 'user', content: 'our input' }]);
    });

    it('maps agentmark.request.input (vendor key) exactly like gen_ai.request.input', () => {
      const result = transformer.transform(makeSpan(), {
        'agentmark.request.input': OUR_INPUT,
      });
      expect(result.input).toEqual([{ role: 'user', content: 'our input' }]);
    });

    it('prefers gen_ai.request.input over agentmark.request.input when both present (dual-emit)', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.request.input': OUR_INPUT,
        'agentmark.request.input': JSON.stringify([{ role: 'user', content: 'vendor copy' }]),
      });
      expect(result.input).toEqual([{ role: 'user', content: 'our input' }]);
    });

    it('prefers agentmark.input over the spec fallbacks when both present', () => {
      const result = transformer.transform(makeSpan(), {
        'agentmark.input': 'am-input-value',
        'gen_ai.input.messages': SPEC_INPUT_MESSAGES,
      });
      expect(result.input).toEqual([{ role: 'user', content: 'am-input-value' }]);
    });

    it('maps legacy gen_ai.prompt when no other input key is present', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.prompt': JSON.stringify([{ role: 'user', content: 'legacy prompt' }]),
      });
      expect(result.input).toEqual([{ role: 'user', content: 'legacy prompt' }]);
    });

    it('maps plain-text legacy gen_ai.prompt as a single user message', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.prompt': 'plain text prompt',
      });
      expect(result.input).toEqual([{ role: 'user', content: 'plain text prompt' }]);
    });

    it('prefers gen_ai.input.messages over legacy gen_ai.prompt', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.input.messages': SPEC_INPUT_MESSAGES,
        'gen_ai.prompt': 'legacy loses',
      });
      expect(result.input).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Weather in Paris?' },
      ]);
    });

    it('leaves input undefined when no input keys are present', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.request.model': 'claude-sonnet-4',
      });
      expect(result.input).toBeUndefined();
    });
  });

  describe('gen_ai.system_instructions folding', () => {
    it('prepends a system message to spec-shaped input', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.system_instructions': JSON.stringify([
          { type: 'text', content: 'Be terse.' },
        ]),
        'gen_ai.input.messages': JSON.stringify([
          { role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
        ]),
      });
      expect(result.input).toEqual([
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'Hi' },
      ]);
    });

    it('accepts a plain-string system_instructions value', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.system_instructions': 'Be terse.',
      });
      expect(result.input).toEqual([{ role: 'system', content: 'Be terse.' }]);
    });

    it('does not duplicate when input already starts with a system message', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.system_instructions': 'Be terse.',
        'gen_ai.request.input': JSON.stringify([
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ]),
      });
      expect(result.input).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hi' },
      ]);
    });
  });

  describe('output fallbacks', () => {
    it('maps gen_ai.output.messages (spec shape) when our keys are absent', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.output.messages': SPEC_OUTPUT_MESSAGES,
      });
      expect(result.output).toBe('It is sunny.');
    });

    it('prefers gen_ai.response.output over gen_ai.output.messages when both present', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.response.output': 'our output',
        'gen_ai.output.messages': SPEC_OUTPUT_MESSAGES,
      });
      expect(result.output).toBe('our output');
    });

    it('maps agentmark.response.output (vendor key) exactly like gen_ai.response.output', () => {
      const result = transformer.transform(makeSpan(), {
        'agentmark.response.output': '{"answer": 42}',
      });
      expect(result.output).toBe('{"answer": 42}');
      expect(result.outputObject).toEqual({ answer: 42 });
    });

    it('prefers gen_ai.response.output over agentmark.response.output when both present (dual-emit)', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.response.output': 'our output',
        'agentmark.response.output': 'vendor copy',
      });
      expect(result.output).toBe('our output');
    });

    it('prefers agentmark.output over the spec fallbacks when both present', () => {
      const result = transformer.transform(makeSpan(), {
        'agentmark.output': 'am-output-value',
        'gen_ai.output.messages': SPEC_OUTPUT_MESSAGES,
      });
      expect(result.output).toBe('am-output-value');
    });

    it('maps legacy gen_ai.completion when no other output key is present', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.completion': 'legacy completion text',
      });
      expect(result.output).toBe('legacy completion text');
    });

    it('prefers gen_ai.output.messages over legacy gen_ai.completion', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.output.messages': SPEC_OUTPUT_MESSAGES,
        'gen_ai.completion': 'legacy loses',
      });
      expect(result.output).toBe('It is sunny.');
    });

    it('leaves output undefined when no output keys are present', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.request.model': 'claude-sonnet-4',
      });
      expect(result.output).toBeUndefined();
    });
  });

  describe('usage token fallbacks', () => {
    it('maps legacy gen_ai.usage.prompt_tokens/completion_tokens when current keys absent', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.usage.prompt_tokens': 11,
        'gen_ai.usage.completion_tokens': 7,
      });
      expect(result.inputTokens).toBe(11);
      expect(result.outputTokens).toBe(7);
      expect(result.totalTokens).toBe(18);
    });

    it('prefers gen_ai.usage.input_tokens/output_tokens over the legacy names', () => {
      const result = transformer.transform(makeSpan(), {
        'gen_ai.usage.input_tokens': 100,
        'gen_ai.usage.output_tokens': 50,
        'gen_ai.usage.prompt_tokens': 11,
        'gen_ai.usage.completion_tokens': 7,
      });
      expect(result.inputTokens).toBe(100);
      expect(result.outputTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
    });
  });

  describe('classify — gen_ai.provider.name accepted where gen_ai.system was read', () => {
    const unnamedSpan = makeSpan('some-span');

    it('classifies as GENERATION via gen_ai.provider.name=anthropic fallback', () => {
      const attributes = {
        'gen_ai.provider.name': 'anthropic',
        'gen_ai.usage.input_tokens': 10,
        'gen_ai.response.output': 'text',
      };
      expect(transformer.classify(unnamedSpan, attributes)).toBe(SpanType.GENERATION);
    });

    it('still classifies as GENERATION via deprecated gen_ai.system=anthropic', () => {
      const attributes = {
        'gen_ai.system': 'anthropic',
        'gen_ai.usage.input_tokens': 10,
        'gen_ai.response.output': 'text',
      };
      expect(transformer.classify(unnamedSpan, attributes)).toBe(SpanType.GENERATION);
    });
  });
});

describe('OtelGenAiTransformer — legacy + system_instructions fallbacks', () => {
  const transformer = new OtelGenAiTransformer();

  it('maps legacy gen_ai.prompt to input when canonical keys are absent', () => {
    const result = transformer.transform(makeSpan(), {
      'gen_ai.prompt': JSON.stringify([{ role: 'user', content: 'legacy prompt' }]),
    });
    expect(result.input).toEqual([{ role: 'user', content: 'legacy prompt' }]);
  });

  it('prefers gen_ai.input.messages over legacy gen_ai.prompt', () => {
    const result = transformer.transform(makeSpan(), {
      'gen_ai.input.messages': SPEC_INPUT_MESSAGES,
      'gen_ai.prompt': JSON.stringify([{ role: 'user', content: 'legacy loses' }]),
    });
    expect(result.input).toEqual([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Weather in Paris?' },
    ]);
  });

  it('maps plain-text legacy gen_ai.completion to output', () => {
    const result = transformer.transform(makeSpan(), {
      'gen_ai.completion': 'legacy completion text',
    });
    expect(result.output).toBe('legacy completion text');
  });

  it('prefers gen_ai.output.messages over legacy gen_ai.completion', () => {
    const result = transformer.transform(makeSpan(), {
      'gen_ai.output.messages': SPEC_OUTPUT_MESSAGES,
      'gen_ai.completion': 'legacy loses',
    });
    expect(result.output).toBe('It is sunny.');
  });

  it('folds gen_ai.system_instructions into input as a leading system message', () => {
    const result = transformer.transform(makeSpan(), {
      'gen_ai.system_instructions': JSON.stringify([{ type: 'text', content: 'Be terse.' }]),
      'gen_ai.input.messages': JSON.stringify([
        { role: 'user', parts: [{ type: 'text', content: 'Hi' }] },
      ]),
    });
    expect(result.input).toEqual([
      { role: 'system', content: 'Be terse.' },
      { role: 'user', content: 'Hi' },
    ]);
  });

  it('maps legacy gen_ai.usage.prompt_tokens/completion_tokens when current keys absent', () => {
    const result = transformer.transform(makeSpan(), {
      'gen_ai.usage.prompt_tokens': 11,
      'gen_ai.usage.completion_tokens': 7,
    });
    expect(result.inputTokens).toBe(11);
    expect(result.outputTokens).toBe(7);
    expect(result.totalTokens).toBe(18);
  });
});

describe('normalizeSpan — gen_ai.conversation.id sessionId fallback', () => {
  const resource = { attributes: { 'service.name': 'test-service' } };
  const scope = { name: 'agentmark' };

  const baseSpan: OtelSpan = {
    traceId: 'trace-1',
    spanId: 'span-1',
    name: 'chat claude-sonnet-4',
    kind: 1,
    startTimeUnixNano: '1000000000',
    endTimeUnixNano: '2000000000',
  };

  it('maps gen_ai.conversation.id to sessionId when agentmark.session_id is absent', () => {
    const normalized = normalizeSpan(resource, scope, {
      ...baseSpan,
      attributes: { 'gen_ai.conversation.id': 'conv-123' },
    });
    expect(normalized.sessionId).toBe('conv-123');
  });

  it('prefers agentmark.session_id over gen_ai.conversation.id when both present', () => {
    const normalized = normalizeSpan(resource, scope, {
      ...baseSpan,
      attributes: {
        'agentmark.session_id': 'am-session',
        'gen_ai.conversation.id': 'conv-123',
      },
    });
    expect(normalized.sessionId).toBe('am-session');
  });

  it('leaves sessionId undefined when neither key is present', () => {
    const normalized = normalizeSpan(resource, scope, {
      ...baseSpan,
      attributes: {},
    });
    expect(normalized.sessionId).toBeUndefined();
  });
});

describe('TypeClassifier — gen_ai.provider.name', () => {
  it('classifies spans with gen_ai.provider.name as GENERATION', () => {
    const result = typeClassifier.classify(makeSpan('any-span'), {
      'gen_ai.provider.name': 'anthropic',
    });
    expect(result).toBe(SpanType.GENERATION);
  });
});
