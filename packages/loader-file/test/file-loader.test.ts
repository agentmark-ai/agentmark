import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
// Import through the shim entry on purpose: this package is now a re-export
// of @agentmark-ai/prompt-core/loader-file, and this suite proves the chain.
import { FileLoader } from "../src/index";

/**
 * Tests for FileLoader, focused on the two contracts the customer
 * project surfaced:
 *
 *  1. Path normalization — both `dataset.jsonl` (relative to
 *     basePath = dist/agentmark/) and `./agentmark/dataset.jsonl`
 *     (the natural project-root-relative form a user writes in
 *     prompt frontmatter) must resolve to the same file. Mirror
 *     spec lives in the Python `FileDatasetReader` (multi-probe
 *     fallback) and in the api-server's `/v1/templates` handler.
 *
 *  2. Dataset assets live alongside compiled prompts in the build
 *     output directory — they are NOT looked up from the source
 *     tree at runtime. `agentmark build` is what places them there.
 */

let baseDir: string;
let cwdBefore: string;

beforeEach(() => {
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "file-loader-test-"));
  cwdBefore = process.cwd();
});

afterEach(() => {
  process.chdir(cwdBefore);
  // Windows: rmSync can race antivirus / file-system handles and fail
  // with ENOTEMPTY even with `force: true`. maxRetries + retryDelay
  // tell Node to back off and retry on ENOTEMPTY/EBUSY/EPERM/EMFILE/ENFILE.
  // Effectively a no-op on Linux/macOS (succeeds first try).
  fs.rmSync(baseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

/** Write a JSON-encoded BuiltPrompt envelope to the loader's base dir. */
function writeBuiltPrompt(
  relativePath: string,
  ast: unknown,
  kind: "text" | "object" = "text",
  name: string = "test-prompt",
): void {
  const full = path.join(baseDir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(
    full,
    JSON.stringify({
      ast,
      metadata: {
        path: relativePath,
        kind,
        name,
        builtAt: new Date().toISOString(),
      },
    }),
  );
}

/** Write a JSONL dataset file under the loader's base dir. */
function writeDataset(relativePath: string, rows: object[]): void {
  const full = path.join(baseDir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, rows.map((r) => JSON.stringify(r)).join("\n"));
}

async function collect<T>(stream: ReadableStream<T>): Promise<T[]> {
  const out: T[] = [];
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

describe("FileLoader.load", () => {
  it("loads a pre-built prompt by name without extension", async () => {
    writeBuiltPrompt("party-planner.prompt.json", { type: "root" });
    const loader = new FileLoader(baseDir);

    const ast = await loader.load("party-planner", "text");

    expect(ast).toEqual({ type: "root" });
  });

  it("loads with the .prompt.mdx extension form (user-facing in dev)", async () => {
    writeBuiltPrompt("party-planner.prompt.json", { type: "root", marker: "mdx" });
    const loader = new FileLoader(baseDir);

    const ast = await loader.load("party-planner.prompt.mdx", "text");

    expect(ast).toEqual({ type: "root", marker: "mdx" });
  });

  it("loads a nested prompt under a sub-directory", async () => {
    writeBuiltPrompt("agents/customer-support.prompt.json", {
      type: "root",
      marker: "nested",
    });
    const loader = new FileLoader(baseDir);

    const ast = await loader.load("agents/customer-support", "text");

    expect(ast).toEqual({ type: "root", marker: "nested" });
  });

  it("throws a clear error when the prompt isn't found", async () => {
    const loader = new FileLoader(baseDir);

    await expect(loader.load("does-not-exist", "text")).rejects.toThrow(
      /Pre-built prompt not found/,
    );
  });

  it("rejects absolute paths", async () => {
    const loader = new FileLoader(baseDir);

    await expect(loader.load("/etc/passwd", "text")).rejects.toThrow(
      /Absolute paths are not allowed/,
    );
  });

  it("blocks path traversal attempts (.. escape)", async () => {
    const loader = new FileLoader(baseDir);
    // Create a sibling outside the base dir
    fs.writeFileSync(
      path.join(path.dirname(baseDir), "outside.prompt.json"),
      JSON.stringify({ ast: { secret: true } }),
    );

    await expect(loader.load("../outside", "text")).rejects.toThrow(
      /Access denied/,
    );
  });

  it("blocks deep traversal through an existing subdirectory", async () => {
    const loader = new FileLoader(baseDir);
    await expect(loader.load("sub/../../outside", "text")).rejects.toThrow(
      /Access denied/,
    );
  });

  it("blocks escape into a sibling directory sharing the base prefix", async () => {
    // `${baseDir}-evil` starts with the base path string but is OUTSIDE it —
    // the containment check must compare against `base + path.sep`, not a
    // bare prefix.
    const evilDir = `${baseDir}-evil`;
    fs.mkdirSync(evilDir, { recursive: true });
    fs.writeFileSync(
      path.join(evilDir, "x.prompt.json"),
      JSON.stringify({ ast: {} }),
    );
    const loader = new FileLoader(baseDir);
    await expect(
      loader.load(`../${path.basename(evilDir)}/x`, "text"),
    ).rejects.toThrow(/Access denied/);
  });

  it("rejects paths containing NUL bytes", async () => {
    const loader = new FileLoader(baseDir);
    await expect(loader.load("a\0b", "text")).rejects.toThrow(/Invalid path/);
  });
});

describe("FileLoader.loadDataset", () => {
  // The path passed to `loadDataset` is taken at face value: joined
  // against the constructor's `basePath` and resolved. No automatic
  // prefix stripping or fallback probing — callers control the base
  // path explicitly, and a mismatched path fails loudly rather than
  // silently resolving to a different file. This keeps the loader's
  // contract simple and matches the api-server's `/v1/templates`
  // handler.
  it("loads a dataset at the path relative to basePath", async () => {
    writeDataset("data.jsonl", [
      { input: { x: 1 }, expected_output: "one" },
      { input: { x: 2 }, expected_output: "two" },
    ]);
    const loader = new FileLoader(baseDir);

    const rows = await collect(await loader.loadDataset("data.jsonl"));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ input: { x: 1 } });
  });

  it("preserves sub-directory structure under basePath for nested datasets", async () => {
    writeDataset("fixtures/cases.jsonl", [{ input: { case: "a" } }]);
    const loader = new FileLoader(baseDir);

    const rows = await collect(
      await loader.loadDataset("fixtures/cases.jsonl"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ input: { case: "a" } });
  });

  it("rejects datasets that are not .jsonl", async () => {
    const loader = new FileLoader(baseDir);

    await expect(loader.loadDataset("data.csv")).rejects.toThrow(
      /JSON Lines file/,
    );
  });

  it("throws a clear error when the dataset file is missing", async () => {
    const loader = new FileLoader(baseDir);

    // Existence is checked eagerly before the stream is constructed —
    // the error surfaces from `loadDataset()` itself, not from reading
    // the returned stream. Pinning this behavior so a future refactor
    // toward lazy-error semantics is a conscious choice, not accidental.
    await expect(loader.loadDataset("missing.jsonl")).rejects.toThrow(
      /Dataset not found/,
    );
  });

  it("rejects path traversal in dataset paths", async () => {
    const loader = new FileLoader(baseDir);

    await expect(loader.loadDataset("../outside.jsonl")).rejects.toThrow(
      /Access denied/,
    );
  });

  it("errors on JSONL rows missing an `input` field", async () => {
    // Schema regression guard: dataset rows must conform to
    // `{ input: object, expected_output?: string }`. Without this
    // validation a malformed row would silently flow into experiment
    // runners and produce confusing downstream failures.
    writeDataset("bad.jsonl", [{ wrong_key: 1 } as object]);
    const loader = new FileLoader(baseDir);

    const stream = await loader.loadDataset("bad.jsonl");
    await expect(collect(stream)).rejects.toThrow(/missing or invalid 'input'/);
  });
});
