/**
 * Path-prefix tests for `getPromptPathByName`.
 *
 * Verifies the `/v1/config`-derived prefix logic and the response-shape
 * handling for `/v1/prompts?name=X`:
 *
 *   default config                → `agentmark/<path>`
 *   `agentmark.json` agentmarkPath → `<agentmarkPath>/agentmark/<path>`
 *   single match                  → returns it
 *   zero matches                  → null
 *   multiple matches (collision)  → null (caller treats as "missing"
 *                                   until we add a richer return type)
 *
 * Uses MSW to mock the api-server at the network boundary, matching the
 * convention used elsewhere in the monorepo (see
 * `apps/tenant-dashboard/src/test-helpers/msw-handlers/*`). The sibling
 * `api-server-prompts-by-name.test.ts` covers the integration path against
 * a real express server.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { getPromptPathByName } from "../src/lib/api/prompts";

const API_BASE = "http://localhost:9418";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("getPromptPathByName — prefix + response shape", () => {
  it("prepends `<agentmarkPath>/agentmark/` when config sets agentmarkPath", async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({ data: { paths: ["custom.prompt.mdx"] } }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({ data: { config: { agentmarkPath: "src" } } }),
      ),
    );

    expect(await getPromptPathByName("customized")).toBe(
      "src/agentmark/custom.prompt.mdx",
    );
  });

  it("falls back to bare `agentmark/` when /v1/config returns 404", async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({ data: { paths: ["fallback.prompt.mdx"] } }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );

    expect(await getPromptPathByName("fallback")).toBe(
      "agentmark/fallback.prompt.mdx",
    );
  });

  it("falls back to bare `agentmark/` when config has no agentmarkPath field", async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({ data: { paths: ["plain.prompt.mdx"] } }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({ data: { config: { somethingElse: true } } }),
      ),
    );

    expect(await getPromptPathByName("plain")).toBe(
      "agentmark/plain.prompt.mdx",
    );
  });

  it("preserves nested paths inside the prefix", async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({ data: { paths: ["prompts/deep/nested.prompt.mdx"] } }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({ data: { config: {} } }),
      ),
    );

    expect(await getPromptPathByName("deeply_nested")).toBe(
      "agentmark/prompts/deep/nested.prompt.mdx",
    );
  });

  it("returns null when the server reports zero matches", async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({ data: { paths: [] } }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );

    expect(await getPromptPathByName("ghost")).toBeNull();
  });

  it("returns null on collisions (>1 match) until callers can disambiguate", async () => {
    // The platform's `(app_id, name, parent_path, file_extension)`
    // uniqueness lets two prompts share a `name` if they live in
    // different folders. The dialog can't currently pick one, so we
    // return null and render a "missing" state. A future iteration could
    // surface the collision list to the user.
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({
          data: { paths: ["a/dup.prompt.mdx", "b/dup.prompt.mdx"] },
        }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );

    expect(await getPromptPathByName("dup")).toBeNull();
  });

  it("returns null on server error (5xx)", async () => {
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({}, { status: 500 }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );

    expect(await getPromptPathByName("broken")).toBeNull();
  });

  it("tolerates a flat `{ paths }` shape from older api-server peers", async () => {
    // Forward-compat shim: if a stale OSS api-server still emits the
    // pre-envelope shape, the client should still resolve the path.
    server.use(
      http.get(`${API_BASE}/v1/prompts`, () =>
        HttpResponse.json({ paths: ["legacy.prompt.mdx"] }),
      ),
      http.get(`${API_BASE}/v1/config`, () =>
        HttpResponse.json({}, { status: 404 }),
      ),
    );

    expect(await getPromptPathByName("legacy")).toBe(
      "agentmark/legacy.prompt.mdx",
    );
  });
});
