import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import fs from "fs";
import { FileLoader, BuiltPrompt } from "../src/loaders/file";

describe("FileLoader", () => {
  const testDir = path.join(__dirname, "test-built-prompts");

  // Sample AST structure (simplified)
  const sampleTextAst = {
    type: "root",
    children: [
      {
        type: "yaml",
        value: "name: greeting\ntext_config:\n  model_name: gpt-4o",
      },
      {
        type: "mdxJsxFlowElement",
        name: "User",
        children: [{ type: "text", value: "Hello!" }],
      },
    ],
  };

  const sampleObjectAst = {
    type: "root",
    children: [
      {
        type: "yaml",
        value:
          "name: parser\nobject_config:\n  model_name: gpt-4o\n  schema:\n    type: object",
      },
      {
        type: "mdxJsxFlowElement",
        name: "User",
        children: [{ type: "text", value: "Parse this" }],
      },
    ],
  };

  beforeEach(() => {
    // Create test directory with pre-built prompts
    fs.mkdirSync(testDir, { recursive: true });

    // Create a text prompt JSON
    const textPrompt: BuiltPrompt = {
      ast: sampleTextAst as any,
      metadata: {
        path: "greeting.prompt.mdx",
        kind: "text",
        name: "greeting",
        builtAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(
      path.join(testDir, "greeting.prompt.json"),
      JSON.stringify(textPrompt, null, 2)
    );

    // Create an object prompt JSON
    const objectPrompt: BuiltPrompt = {
      ast: sampleObjectAst as any,
      metadata: {
        path: "parser.prompt.mdx",
        kind: "object",
        name: "parser",
        builtAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(
      path.join(testDir, "parser.prompt.json"),
      JSON.stringify(objectPrompt, null, 2)
    );

    // Create nested directory structure
    fs.mkdirSync(path.join(testDir, "nested", "deep"), { recursive: true });
    const nestedPrompt: BuiltPrompt = {
      ast: sampleTextAst as any,
      metadata: {
        path: "nested/deep/nested.prompt.mdx",
        kind: "text",
        name: "nested",
        builtAt: new Date().toISOString(),
      },
    };
    fs.writeFileSync(
      path.join(testDir, "nested", "deep", "nested.prompt.json"),
      JSON.stringify(nestedPrompt, null, 2)
    );

    // Create a dataset file
    const datasetContent = [
      '{"input": {"name": "Alice"}, "expected_output": "Hello Alice!"}',
      '{"input": {"name": "Bob"}, "expected_output": "Hello Bob!"}',
      '{"input": {"name": "Carol"}}',
    ].join("\n");
    fs.writeFileSync(path.join(testDir, "test-data.jsonl"), datasetContent);
  });

  afterEach(() => {
    // Cleanup test directory
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe("load", () => {
    it("loads a pre-built prompt by its .mdx path", async () => {
      const loader = new FileLoader(testDir);
      const ast = await loader.load("greeting.prompt.mdx", "text");

      expect(ast).toBeDefined();
      expect(ast.type).toBe("root");
      expect(Array.isArray(ast.children)).toBe(true);
    });

    it("loads prompts from nested directories", async () => {
      const loader = new FileLoader(testDir);
      const ast = await loader.load("nested/deep/nested.prompt.mdx", "text");

      expect(ast).toBeDefined();
      expect(ast.type).toBe("root");
    });

    it("throws error for non-existent prompt", async () => {
      const loader = new FileLoader(testDir);

      await expect(
        loader.load("nonexistent.prompt.mdx", "text")
      ).rejects.toThrow("Pre-built prompt not found");
    });

    it("throws error for absolute paths", async () => {
      const loader = new FileLoader(testDir);

      await expect(
        loader.load("/etc/passwd", "text")
      ).rejects.toThrow("Absolute paths are not allowed");
    });

    it("throws error for path traversal attempts", async () => {
      const loader = new FileLoader(testDir);

      await expect(
        loader.load("../../../etc/passwd", "text")
      ).rejects.toThrow("Access denied: path outside allowed directory");
    });

    it("converts .mdx extension to .json when loading", async () => {
      const loader = new FileLoader(testDir);

      // This should work because greeting.prompt.mdx -> greeting.prompt.json
      const ast = await loader.load("greeting.prompt.mdx", "text");
      expect(ast).toBeDefined();
    });

    it("loads prompt without any extension", async () => {
      const loader = new FileLoader(testDir);

      // greeting -> greeting.prompt.json
      const ast = await loader.load("greeting", "text");
      expect(ast).toBeDefined();
      expect(ast.type).toBe("root");
    });

    it("loads prompt with .prompt extension (no .mdx)", async () => {
      const loader = new FileLoader(testDir);

      // greeting.prompt -> greeting.prompt.json
      const ast = await loader.load("greeting.prompt", "text");
      expect(ast).toBeDefined();
      expect(ast.type).toBe("root");
    });

    it("loads nested prompts without extension", async () => {
      const loader = new FileLoader(testDir);

      // nested/deep/nested -> nested/deep/nested.prompt.json
      const ast = await loader.load("nested/deep/nested", "text");
      expect(ast).toBeDefined();
      expect(ast.type).toBe("root");
    });

    it("returns the AST from the built prompt structure", async () => {
      const loader = new FileLoader(testDir);
      const ast = await loader.load("parser.prompt.mdx", "object");

      // Verify we got the actual AST, not the wrapper
      expect(ast.type).toBe("root");
      expect(ast).not.toHaveProperty("metadata");
    });
  });

  describe("loadDataset", () => {
    it("loads a dataset file as a stream", async () => {
      const loader = new FileLoader(testDir);
      const stream = await loader.loadDataset("test-data.jsonl");

      expect(stream).toBeInstanceOf(ReadableStream);

      // Read all items from stream
      const reader = stream.getReader();
      const items: any[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        items.push(value);
      }

      expect(items).toHaveLength(3);
      expect(items[0].input.name).toBe("Alice");
      expect(items[0].expected_output).toBe("Hello Alice!");
      expect(items[1].input.name).toBe("Bob");
      expect(items[2].input.name).toBe("Carol");
      expect(items[2].expected_output).toBeUndefined();
    });

    it("throws error for non-.jsonl files", async () => {
      const loader = new FileLoader(testDir);

      await expect(loader.loadDataset("test.json")).rejects.toThrow(
        "Dataset must be a JSON Lines file"
      );
    });

    it("throws error for non-existent dataset", async () => {
      const loader = new FileLoader(testDir);

      await expect(loader.loadDataset("nonexistent.jsonl")).rejects.toThrow(
        "Dataset not found"
      );
    });

    it("throws error for path traversal in dataset path", async () => {
      const loader = new FileLoader(testDir);

      await expect(
        loader.loadDataset("../../../etc/passwd.jsonl")
      ).rejects.toThrow("Access denied");
    });

    it("throws error for invalid JSON in dataset", async () => {
      // Create invalid dataset
      fs.writeFileSync(
        path.join(testDir, "invalid.jsonl"),
        '{"input": {"name": "test"}}\n{invalid json}\n'
      );

      const loader = new FileLoader(testDir);
      const stream = await loader.loadDataset("invalid.jsonl");

      const reader = stream.getReader();

      // First item should work
      const first = await reader.read();
      expect(first.value.input.name).toBe("test");

      // Second item should throw
      await expect(reader.read()).rejects.toThrow("Failed to parse JSON");
    });

    it("throws error for dataset rows missing input field", async () => {
      // Create dataset with missing input
      fs.writeFileSync(
        path.join(testDir, "no-input.jsonl"),
        '{"expected_output": "test"}\n'
      );

      const loader = new FileLoader(testDir);
      const stream = await loader.loadDataset("no-input.jsonl");

      const reader = stream.getReader();
      await expect(reader.read()).rejects.toThrow("missing or invalid 'input' field");
    });

    it("throws error for empty dataset", async () => {
      // Create empty dataset
      fs.writeFileSync(path.join(testDir, "empty.jsonl"), "");

      const loader = new FileLoader(testDir);
      const stream = await loader.loadDataset("empty.jsonl");

      const reader = stream.getReader();
      await expect(reader.read()).rejects.toThrow("empty or contains no valid rows");
    });

    it("skips empty lines in dataset", async () => {
      // Create dataset with empty lines
      fs.writeFileSync(
        path.join(testDir, "with-blanks.jsonl"),
        '{"input": {"a": 1}}\n\n{"input": {"b": 2}}\n   \n{"input": {"c": 3}}\n'
      );

      const loader = new FileLoader(testDir);
      const stream = await loader.loadDataset("with-blanks.jsonl");

      const reader = stream.getReader();
      const items: any[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        items.push(value);
      }

      expect(items).toHaveLength(3);
    });
  });

  describe("constructor", () => {
    it("resolves relative paths from cwd", () => {
      const loader = new FileLoader("./test-dir");
      // The loader should have resolved the path
      expect(loader).toBeDefined();
    });

    it("handles absolute paths in constructor", () => {
      const loader = new FileLoader(testDir);
      expect(loader).toBeDefined();
    });
  });
});
