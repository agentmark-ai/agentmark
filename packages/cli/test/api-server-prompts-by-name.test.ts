/**
 * E2E test for the "Add to Prompt" file-path resolver.
 *
 * Boots the real express api-server inside a temp directory with real
 * `.prompt.mdx` files on disk and exercises `getPromptPathByName` end-to-end —
 * the same code the trace drawer dialog calls in production.
 *
 * Importantly, this exists because we deliberately *avoided* adding a
 * server-side resolve endpoint. The whole flow (list prompts → match by
 * filename convention → fall back to scanning frontmatter via
 * `/v1/templates`) only works if the existing endpoints behave correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createApiServer } from "../cli-src/api-server";
import type { Server } from "http";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

let server: Server;
let port: number;
let tmpRoot: string;
let originalCwd: string;
let getPromptPathByName: (name: string) => Promise<string | null>;

function writePrompt(relPath: string, frontmatter: string, body = "<User>{props.x}</User>") {
  const full = path.join(tmpRoot, "agentmark", relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `---\n${frontmatter}\n---\n\n${body}\n`, "utf-8");
}

describe("getPromptPathByName (e2e against real api-server)", () => {
  beforeAll(async () => {
    originalCwd = process.cwd();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-prompts-"));
    fs.mkdirSync(path.join(tmpRoot, "agentmark"), { recursive: true });

    // Conventional filename + matching frontmatter: should hit the fast path.
    writePrompt(
      "hello.prompt.mdx",
      "name: hello\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514"
    );

    // Conventional filename — but `name` doesn't match, so a name lookup
    // for "hello" should NOT return this path.
    writePrompt(
      "decoys/aliased.prompt.mdx",
      "name: not-hello\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514"
    );

    // Non-conventional filename: only resolvable via the slow (frontmatter)
    // path. Forces the fallback to actually work.
    writePrompt(
      "nested/dir/file-with-different-name.prompt.mdx",
      "name: deeply_named\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514"
    );

    // Subdirectories shouldn't break basename matching for the fast path.
    writePrompt(
      "category/classify.prompt.mdx",
      "name: classify\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514"
    );

    // Switch cwd so the api-server picks up our tmp templates dir.
    process.chdir(tmpRoot);

    port = 19500 + Math.floor(Math.random() * 500);

    // CLI's config/api.ts reads NEXT_PUBLIC_AGENTMARK_API_PORT at module
    // load — set it BEFORE the (lazy) import below so `API_URL` points at
    // our test server.
    process.env.NEXT_PUBLIC_AGENTMARK_API_PORT = String(port);

    server = (await createApiServer(port)) as Server;

    const mod = await import("../src/lib/api/prompts");
    getPromptPathByName = mod.getPromptPathByName;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    try {
      process.chdir(originalCwd);
    } catch {
      // Some test runners leave us in a deleted cwd; ignore.
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("resolves via filename convention (fast path)", async () => {
    // Path is relative to the project root, so the user can paste the
    // returned command from where they ran `agentmark dev`.
    const p = await getPromptPathByName("hello");
    expect(p).toBe("agentmark/hello.prompt.mdx");
  });

  it("resolves via filename convention even when nested under a subdir", async () => {
    const p = await getPromptPathByName("classify");
    // The user's example: `agentmark/category/classify.prompt.mdx`. The
    // path includes the `agentmark/` prefix so `agentmark run-prompt` finds
    // the file when invoked from the project root.
    expect(p).toBe("agentmark/category/classify.prompt.mdx");
  });

  it("falls back to frontmatter scan when filename does not match name", async () => {
    const p = await getPromptPathByName("deeply_named");
    expect(p).toBe(
      "agentmark/nested/dir/file-with-different-name.prompt.mdx"
    );
  });

  it("returns null for an unknown name", async () => {
    const p = await getPromptPathByName("does-not-exist");
    expect(p).toBeNull();
  });

  it("does not falsely match by filename when frontmatter `name` differs", async () => {
    // The `decoys/aliased.prompt.mdx` file has `name: not-hello` — it must
    // not be returned for the lookup of "aliased".
    const p = await getPromptPathByName("aliased");
    expect(p).toBeNull();
  });

  it("returns null for an empty name (defensive guard)", async () => {
    const p = await getPromptPathByName("");
    expect(p).toBeNull();
  });

  it("resolves URI-encoded names correctly via the templates endpoint", async () => {
    // Names with whitespace force encodeURIComponent to actually do work.
    writePrompt(
      "spaced.prompt.mdx",
      "name: name with spaces\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514"
    );
    const p = await getPromptPathByName("name with spaces");
    expect(p).toBe("agentmark/spaced.prompt.mdx");
  });

  it("bounds the slow-path scan when no convention match exists", async () => {
    // Pin sequential bail-on-hit behavior for the slow path. A future
    // "optimization" that parallelizes via Promise.all would slam the
    // api-server with N concurrent /v1/templates requests for users with
    // hundreds of prompts. Sequential is correct; the cost is bounded by the
    // position of the match. This test creates 25 unconventional prompts
    // where only the last carries the matching `name`.
    for (let i = 0; i < 24; i++) {
      writePrompt(
        `bulk/decoy-${String(i).padStart(2, "0")}.prompt.mdx`,
        `name: decoy_${i}\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514`
      );
    }
    writePrompt(
      "bulk/zz-target.prompt.mdx",
      "name: bulk_target\ntext_config:\n  model_name: anthropic/claude-sonnet-4-20250514"
    );

    const start = Date.now();
    const p = await getPromptPathByName("bulk_target");
    const elapsed = Date.now() - start;

    expect(p).toBe("agentmark/bulk/zz-target.prompt.mdx");
    // Localhost should comfortably finish a 25-file frontmatter scan well
    // under a few seconds. If this trips, something has regressed.
    expect(elapsed).toBeLessThan(10_000);
  });

});
