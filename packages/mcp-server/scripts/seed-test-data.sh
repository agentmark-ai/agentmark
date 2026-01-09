#!/bin/bash
#
# Seeds test data for integration tests
#
# Usage:
#   ./scripts/seed-test-data.sh [port]
#
# Default port: 9419

set -e

PORT="${1:-9419}"
URL="http://localhost:${PORT}/v1/traces"

echo "Seeding test data to ${URL}..."

curl -sf -X POST "${URL}" \
  -H "Content-Type: application/json" \
  -d '{
    "resourceSpans": [{
      "resource": {
        "attributes": [
          {"key": "service.name", "value": {"stringValue": "integration-test"}}
        ]
      },
      "scopeSpans": [{
        "scope": {"name": "test-scope"},
        "spans": [
          {
            "traceId": "d4cda95b652f4a1592b449d5929fda1b",
            "spanId": "6e0c63257de34c92",
            "name": "integration-test-trace",
            "kind": 1,
            "startTimeUnixNano": "1704067200000000000",
            "endTimeUnixNano": "1704067201000000000",
            "status": {"code": 1},
            "attributes": [
              {"key": "agentmark.trace.name", "value": {"stringValue": "Integration Test Trace"}},
              {"key": "gen_ai.system", "value": {"stringValue": "anthropic"}}
            ]
          },
          {
            "traceId": "d4cda95b652f4a1592b449d5929fda1b",
            "spanId": "7e0c63257de34c93",
            "parentSpanId": "6e0c63257de34c92",
            "name": "generation-span",
            "kind": 1,
            "startTimeUnixNano": "1704067200100000000",
            "endTimeUnixNano": "1704067200900000000",
            "status": {"code": 1},
            "attributes": [
              {"key": "agentmark.span.type", "value": {"stringValue": "GENERATION"}},
              {"key": "gen_ai.usage.input_tokens", "value": {"intValue": "100"}},
              {"key": "gen_ai.usage.output_tokens", "value": {"intValue": "50"}},
              {"key": "gen_ai.response.model", "value": {"stringValue": "claude-3-opus"}}
            ]
          }
        ]
      }]
    }]
  }'

echo ""
echo "Test data seeded successfully"
