import { describe, it, expect, afterEach, vi } from "vitest";
import { ApiLoader } from "../src/loaders/api-loader";

/**
 * ApiLoader addresses prompts strictly by their canonical `<name>.prompt.mdx`
 * path. FileLoader is lenient (it also accepts the bare slug), so code that
 * works locally can 404 against the API on the same name. When that happens
 * the loader must point at the canonical form instead of letting an addressing
 * mismatch read as "the prompt doesn't exist".
 */
describe("ApiLoader canonical-path hint on 404", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stub404 = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        json: async () => body,
      }))
    );

  it("appends the canonical `.prompt.mdx` hint when a bare slug 404s", async () => {
    stub404({ error: { code: "not_found", message: "File not found" } });
    const loader = ApiLoader.local({ baseUrl: "http://localhost:9418" });

    await expect(
      loader.load("greeting", "text", {})
    ).rejects.toMatchObject({
      code: "not_found",
      message: 'File not found Did you mean "greeting.prompt.mdx"? Prompts are addressed by their full path.',
      hint: 'Did you mean "greeting.prompt.mdx"? Prompts are addressed by their full path.',
    });
  });

  it("normalizes a partial extension (`.prompt`) to the canonical hint", async () => {
    stub404({ error: { code: "not_found", message: "File not found" } });
    const loader = ApiLoader.local({ baseUrl: "http://localhost:9418" });

    await expect(
      loader.load("greeting.prompt", "text", {})
    ).rejects.toMatchObject({
      hint: 'Did you mean "greeting.prompt.mdx"? Prompts are addressed by their full path.',
    });
  });

  it("does NOT add a hint when the path is already canonical", async () => {
    stub404({ error: { code: "not_found", message: "File not found" } });
    const loader = ApiLoader.local({ baseUrl: "http://localhost:9418" });

    await expect(
      loader.load("greeting.prompt.mdx", "text", {})
    ).rejects.toEqual({ code: "not_found", message: "File not found" });
  });

  it("does NOT add a hint for non-404 errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: { code: "internal_error", message: "boom" } }),
      }))
    );
    const loader = ApiLoader.local({ baseUrl: "http://localhost:9418" });

    await expect(
      loader.load("greeting", "text", {})
    ).rejects.toEqual({ code: "internal_error", message: "boom" });
  });
});
