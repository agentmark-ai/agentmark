/**
 * Alert schema tests.
 *
 * The alert API is the agent-provisioning surface, so the validation
 * contract MUST be locked down by tests rather than discovered at
 * runtime by a confused LLM. Each test names the agent-facing rule it
 * enforces.
 */

import { describe, it, expect } from 'vitest';
import {
  CreateAlertBodySchema,
  UpdateAlertBodySchema,
  AlertsListParamsSchema,
  AlertSchema,
  AlertHistorySchema,
  SlackChannelSchema,
  ALERT_METRIC_VALUES,
  ALERT_STATUS_VALUES,
  EVALUATION_AGGREGATION_VALUES,
  EVALUATION_DIRECTION_VALUES,
  ALERT_TIME_WINDOW_MIN,
  ALERT_TIME_WINDOW_MAX,
} from '../index';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

describe('alert enums match the SQL CHECK constraints', () => {
  it('ALERT_METRIC_VALUES matches the four metrics the cron evaluates', () => {
    expect([...ALERT_METRIC_VALUES].sort()).toEqual([
      'cost',
      'error_rate',
      'evaluation_score',
      'latency',
    ]);
  });

  it('ALERT_STATUS_VALUES matches the two states the cron transitions through', () => {
    expect([...ALERT_STATUS_VALUES].sort()).toEqual(['resolved', 'triggered']);
  });

  it('EVALUATION_AGGREGATION_VALUES matches the SQL check constraint', () => {
    expect([...EVALUATION_AGGREGATION_VALUES].sort()).toEqual(['avg', 'individual']);
  });

  it('EVALUATION_DIRECTION_VALUES matches the SQL check constraint', () => {
    expect([...EVALUATION_DIRECTION_VALUES].sort()).toEqual(['above', 'below']);
  });
});

// ---------------------------------------------------------------------------
// Time window bounds
// ---------------------------------------------------------------------------

describe('time window bounds match the dashboard Yup schema', () => {
  it('exposes 5/100 as the agent-facing minute bounds', () => {
    expect(ALERT_TIME_WINDOW_MIN).toBe(5);
    expect(ALERT_TIME_WINDOW_MAX).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// CreateAlertBodySchema — happy paths
// ---------------------------------------------------------------------------

describe('CreateAlertBodySchema — happy paths', () => {
  it('accepts an error_rate alert with no evaluation fields', () => {
    const result = CreateAlertBodySchema.parse({
      name: 'High error rate',
      metric: 'error_rate',
      threshold: 5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    });
    expect(result.metric).toBe('error_rate');
  });

  it('accepts a latency alert with integer threshold', () => {
    const result = CreateAlertBodySchema.parse({
      name: 'p99',
      metric: 'latency',
      threshold: 1000,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    });
    expect(result.threshold).toBe(1000);
  });

  it('accepts a cost alert with positive threshold', () => {
    const result = CreateAlertBodySchema.parse({
      name: 'Cost watch',
      metric: 'cost',
      threshold: 5.5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    });
    expect(result.threshold).toBe(5.5);
  });

  it('accepts an evaluation_score alert with all evaluation fields', () => {
    const result = CreateAlertBodySchema.parse({
      name: 'Quality watch',
      metric: 'evaluation_score',
      threshold: 0.7,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
      evaluation_name: 'quality',
      evaluation_aggregation: 'avg',
      evaluation_threshold_direction: 'below',
    });
    expect(result.evaluation_name).toBe('quality');
  });

  it('defaults use_slack and use_webhook to false', () => {
    const result = CreateAlertBodySchema.parse({
      name: 'Defaults',
      metric: 'error_rate',
      threshold: 5,
      time_window: 15,
    });
    expect(result.use_slack).toBe(false);
    expect(result.use_webhook).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateAlertBodySchema — field-coupling rule
//
// This is the marquee agent-facing rule. Each test pins a specific
// mismatch so an agent can correlate "field=X in error envelope" with
// the right correction.
// ---------------------------------------------------------------------------

describe('CreateAlertBodySchema — evaluation_score field coupling', () => {
  const base = {
    name: 'Quality watch',
    metric: 'evaluation_score' as const,
    threshold: 0.7,
    time_window: 15,
    use_slack: false,
    use_webhook: false,
    evaluation_name: 'quality',
    evaluation_aggregation: 'avg' as const,
    evaluation_threshold_direction: 'below' as const,
  };

  it.each([
    ['evaluation_name'],
    ['evaluation_aggregation'],
    ['evaluation_threshold_direction'],
  ])('rejects evaluation_score without %s', (field) => {
    const body = { ...base, [field]: undefined };
    const result = CreateAlertBodySchema.safeParse(body);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i: { path: (string | number)[] }) => i.path[0] === field);
      expect(issue, `expected an issue on .${field}`).toBeDefined();
    }
  });

  it('rejects non-evaluation_score metrics that set evaluation_name', () => {
    const result = CreateAlertBodySchema.safeParse({
      name: 'X',
      metric: 'error_rate',
      threshold: 5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
      evaluation_name: 'should-not-be-here',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i: { path: (string | number)[] }) => i.path[0] === 'evaluation_name');
      expect(issue).toBeDefined();
    }
  });

  it('rejects non-evaluation_score metrics that set evaluation_aggregation', () => {
    const result = CreateAlertBodySchema.safeParse({
      name: 'X',
      metric: 'cost',
      threshold: 5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
      evaluation_aggregation: 'avg',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CreateAlertBodySchema — per-metric threshold ranges
// ---------------------------------------------------------------------------

describe('CreateAlertBodySchema — threshold ranges per metric', () => {
  function bodyWithThreshold(metric: (typeof ALERT_METRIC_VALUES)[number], threshold: number) {
    if (metric === 'evaluation_score') {
      return {
        name: 'eval',
        metric,
        threshold,
        time_window: 15,
        use_slack: false,
        use_webhook: false,
        evaluation_name: 'quality',
        evaluation_aggregation: 'avg' as const,
        evaluation_threshold_direction: 'below' as const,
      };
    }
    return {
      name: 'a',
      metric,
      threshold,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    };
  }

  it('rejects error_rate threshold > 100', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('error_rate', 150)).success).toBe(false);
  });

  it('rejects error_rate threshold < 0', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('error_rate', -1)).success).toBe(false);
  });

  it('accepts error_rate threshold at 0 and at 100', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('error_rate', 0)).success).toBe(true);
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('error_rate', 100)).success).toBe(true);
  });

  it('rejects latency threshold of 0 (not positive)', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('latency', 0)).success).toBe(false);
  });

  it('rejects non-integer latency threshold', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('latency', 1.5)).success).toBe(false);
  });

  it('rejects cost threshold of 0', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('cost', 0)).success).toBe(false);
  });

  it('rejects evaluation_score threshold > 1', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('evaluation_score', 1.5)).success).toBe(false);
  });

  it('rejects evaluation_score threshold < 0', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('evaluation_score', -0.1)).success).toBe(false);
  });

  it('accepts evaluation_score threshold at 0 and at 1', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('evaluation_score', 0)).success).toBe(true);
    expect(CreateAlertBodySchema.safeParse(bodyWithThreshold('evaluation_score', 1)).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateAlertBodySchema — time window bounds
// ---------------------------------------------------------------------------

describe('CreateAlertBodySchema — time window bounds', () => {
  function bodyWithWindow(time_window: number) {
    return {
      name: 'a',
      metric: 'error_rate' as const,
      threshold: 5,
      time_window,
      use_slack: false,
      use_webhook: false,
    };
  }

  it('rejects time_window below the min', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithWindow(ALERT_TIME_WINDOW_MIN - 1)).success).toBe(false);
  });

  it('rejects time_window above the max', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithWindow(ALERT_TIME_WINDOW_MAX + 1)).success).toBe(false);
  });

  it('rejects non-integer time_window', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithWindow(15.5)).success).toBe(false);
  });

  it('accepts the boundary values exactly', () => {
    expect(CreateAlertBodySchema.safeParse(bodyWithWindow(ALERT_TIME_WINDOW_MIN)).success).toBe(true);
    expect(CreateAlertBodySchema.safeParse(bodyWithWindow(ALERT_TIME_WINDOW_MAX)).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CreateAlertBodySchema — name strip + length
// ---------------------------------------------------------------------------

describe('CreateAlertBodySchema — name handling', () => {
  it('strips null bytes from the name (Postgres TEXT incompat)', () => {
    const result = CreateAlertBodySchema.parse({
      name: 'has nullbyte',
      metric: 'error_rate',
      threshold: 5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    });
    expect(result.name).toBe('hasnullbyte');
  });

  it('rejects empty name', () => {
    const result = CreateAlertBodySchema.safeParse({
      name: '',
      metric: 'error_rate',
      threshold: 5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than the column limit (100)', () => {
    const result = CreateAlertBodySchema.safeParse({
      name: 'a'.repeat(101),
      metric: 'error_rate',
      threshold: 5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// UpdateAlertBodySchema parity — same coupling rules
// ---------------------------------------------------------------------------

describe('UpdateAlertBodySchema mirrors CreateAlertBodySchema rules', () => {
  it('rejects evaluation_score update without evaluation_name', () => {
    const result = UpdateAlertBodySchema.safeParse({
      name: 'X',
      metric: 'evaluation_score',
      threshold: 0.5,
      time_window: 15,
      use_slack: false,
      use_webhook: false,
      evaluation_aggregation: 'avg',
      evaluation_threshold_direction: 'below',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Query / response schemas
// ---------------------------------------------------------------------------

describe('AlertsListParamsSchema', () => {
  it('inherits pagination defaults from PaginationParamsSchema', () => {
    const result = AlertsListParamsSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('accepts optional status filter', () => {
    expect(AlertsListParamsSchema.parse({ status: 'triggered' }).status).toBe('triggered');
  });

  it('rejects unknown status value', () => {
    expect(AlertsListParamsSchema.safeParse({ status: 'never' }).success).toBe(false);
  });
});

describe('AlertSchema', () => {
  it('round-trips a representative row', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      app_id: '33333333-3333-4333-8333-333333333333',
      name: 'X',
      metric: 'error_rate' as const,
      threshold: 5,
      time_window: 15,
      status: 'resolved' as const,
      use_slack: false,
      use_webhook: false,
      evaluation_name: null,
      evaluation_aggregation: null,
      evaluation_threshold_direction: null,
      commit_sha: null,
      created_at: '2026-05-15T00:00:00Z',
      created_by: null,
      updated_at: null,
      updated_by: null,
    };
    expect(AlertSchema.parse(row)).toEqual(row);
  });
});

describe('AlertHistorySchema', () => {
  it('accepts triggered_value as a string (DECIMAL has no JS-safe number)', () => {
    const row = {
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: '22222222-2222-4222-8222-222222222222',
      app_id: '33333333-3333-4333-8333-333333333333',
      alert_id: '44444444-4444-4444-8444-444444444444',
      alert_name: 'X',
      alert_metric: 'error_rate' as const,
      triggered_value: '12.5',
      status: 'triggered' as const,
      evaluation_name: null,
      evaluation_aggregation: null,
      evaluation_threshold_direction: null,
      commit_sha: null,
      created_at: '2026-05-15T00:00:00Z',
    };
    expect(AlertHistorySchema.parse(row).triggered_value).toBe('12.5');
  });
});

describe('SlackChannelSchema', () => {
  it('accepts a minimal channel shape', () => {
    expect(
      SlackChannelSchema.parse({ id: 'C1', name: 'alerts', is_archived: false }),
    ).toEqual({ id: 'C1', name: 'alerts', is_archived: false });
  });
});
