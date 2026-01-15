#!/usr/bin/env node
/**
 * Seeds test data for integration tests
 *
 * Usage:
 *   node scripts/seed-test-data.js [port]
 *
 * Default port: 9419
 */

const port = process.argv[2] || '9419';
const url = `http://localhost:${port}/v1/traces`;

const testData = {
  resourceSpans: [{
    resource: {
      attributes: [
        { key: 'service.name', value: { stringValue: 'integration-test' } }
      ]
    },
    scopeSpans: [{
      scope: { name: 'test-scope' },
      spans: [
        {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '6e0c63257de34c92',
          name: 'integration-test-trace',
          kind: 1,
          startTimeUnixNano: '1704067200000000000',
          endTimeUnixNano: '1704067201000000000',
          status: { code: 1 },
          attributes: [
            { key: 'agentmark.trace.name', value: { stringValue: 'Integration Test Trace' } },
            { key: 'gen_ai.system', value: { stringValue: 'anthropic' } }
          ]
        },
        {
          traceId: 'd4cda95b652f4a1592b449d5929fda1b',
          spanId: '7e0c63257de34c93',
          parentSpanId: '6e0c63257de34c92',
          name: 'generation-span',
          kind: 1,
          startTimeUnixNano: '1704067200100000000',
          endTimeUnixNano: '1704067200900000000',
          status: { code: 1 },
          attributes: [
            { key: 'agentmark.span.type', value: { stringValue: 'GENERATION' } },
            { key: 'gen_ai.usage.input_tokens', value: { intValue: '100' } },
            { key: 'gen_ai.usage.output_tokens', value: { intValue: '50' } },
            { key: 'gen_ai.response.model', value: { stringValue: 'claude-3-opus' } }
          ]
        }
      ]
    }]
  }]
};

async function seedTestData() {
  console.log(`Seeding test data to ${url}...`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
    }

    const result = await response.text();
    console.log(result);
    console.log('Test data seeded successfully');
  } catch (error) {
    console.error('Failed to seed test data:', error.message);
    process.exit(1);
  }
}

seedTestData();
