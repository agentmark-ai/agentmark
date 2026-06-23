/**
 * The CLI's local from-traces conversion mirrors the cloud gateway: a dataset
 * row defaults to the template variables (`props`) — the re-runnable input that
 * `run-experiment` feeds back — not the rendered messages. Messages are the
 * fallback for spans that carry no variables.
 */
import { describe, it, expect } from 'vitest';
import {
  buildDatasetRowFromSource,
  normalizeLocalTraceSource,
} from '../../cli-src/api-server';

const messages = [
  { role: 'system', content: 'You are a router.' },
  { role: 'user', content: 'refund me' },
];

describe('CLI buildDatasetRowFromSource — prefers variables over rendered messages', () => {
  it('defaults the row input to props when the source carries them', () => {
    const row = buildDatasetRowFromSource({
      props: { ticket: 'refund me' },
      input: messages,
      output: { category: 'billing_disputes' },
    });
    expect(row.input).toEqual({ ticket: 'refund me' });
  });

  it('falls back to the messages input when the source has no props', () => {
    const row = buildDatasetRowFromSource({ input: messages, output: {} });
    expect(row.input).toEqual(messages);
  });

  it('treats empty props {} as absent and falls back to messages', () => {
    const row = buildDatasetRowFromSource({ props: {}, input: messages, output: {} });
    expect(row.input).toEqual(messages);
  });

  it('respects an explicit mapping.input over the props default', () => {
    const row = buildDatasetRowFromSource(
      { props: { ticket: 'x' }, input: messages, output: {} },
      { input: '$.input' },
    );
    expect(row.input).toEqual(messages);
  });

  it('ignores array-shaped props and falls back to messages', () => {
    expect(
      buildDatasetRowFromSource({ props: [1, 2, 3], input: messages, output: {} }).input,
    ).toEqual(messages);
  });

  it('ignores null props and falls back to messages', () => {
    expect(
      buildDatasetRowFromSource({ props: null, input: messages, output: {} }).input,
    ).toEqual(messages);
  });

  it('throws referencing $.input when neither variables nor input resolve', () => {
    expect(() => buildDatasetRowFromSource({})).toThrow('$.input');
  });
});

describe('CLI normalizeLocalTraceSource — surfaces prompt variables', () => {
  const genSpan = {
    id: 's1',
    name: 'support-triage',
    parentId: null,
    timestamp: '1',
    data: {
      type: 'GENERATION',
      props: '{"ticket":"refund"}',
      input: '[{"role":"user","content":"refund"}]',
      output: '{"category":"billing_disputes"}',
    },
  };

  it('lifts the prompt span variables to trace-level props and keeps them per-span', () => {
    const src = normalizeLocalTraceSource({ id: 't1', name: 'support-triage', spans: [genSpan] }) as any;
    expect(src.props).toEqual({ ticket: 'refund' });
    expect(src.spans[0].props).toEqual({ ticket: 'refund' });
  });

  it('sets trace-level props to null when no span carries variables', () => {
    const noProps = { ...genSpan, data: { ...genSpan.data, props: undefined } };
    const src = normalizeLocalTraceSource({ id: 't1', name: 'x', spans: [noProps] }) as any;
    expect(src.props).toBeNull();
  });

  it('finds variables on a non-root span (skips spans without props)', () => {
    const wrapper = {
      id: 's0',
      name: 'wrapper',
      parentId: null,
      timestamp: '0',
      data: { type: 'SPAN', input: '{}', output: '{}' },
    };
    const gen = { ...genSpan, id: 's1', parentId: 's0', timestamp: '1' };
    const src = normalizeLocalTraceSource({ id: 't1', name: 'x', spans: [wrapper, gen] }) as any;
    expect(src.props).toEqual({ ticket: 'refund' });
  });

  it('end-to-end: a trace with variables yields a row whose input is the variables', () => {
    const src = normalizeLocalTraceSource({ id: 't1', name: 'x', spans: [genSpan] });
    expect(buildDatasetRowFromSource(src).input).toEqual({ ticket: 'refund' });
  });
});
