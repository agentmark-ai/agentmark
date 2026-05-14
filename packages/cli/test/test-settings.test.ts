import { describe, it, expect } from "vitest";
import type { Root } from "mdast";
import { readTestSettings } from "../cli-src/utils/test-settings";

/**
 * Build a minimal AST containing a yaml frontmatter node with the given
 * YAML string. Mirrors the shape produced by templatedx's parser.
 */
function astWithFrontmatter(yaml: string): Root {
  return {
    type: "root",
    children: [{ type: "yaml", value: yaml } as never],
  };
}

function astWithoutFrontmatter(): Root {
  return { type: "root", children: [] };
}

describe("readTestSettings", () => {
  it("returns undefined when AST has no yaml node", async () => {
    expect(await readTestSettings(astWithoutFrontmatter())).toBeUndefined();
  });

  it("returns undefined when yaml has no test_settings", async () => {
    const ast = astWithFrontmatter("name: my-prompt\ntext_config:\n  model_name: gpt-4o");
    expect(await readTestSettings(ast)).toBeUndefined();
  });

  it("extracts dataset path", async () => {
    const ast = astWithFrontmatter(`test_settings:\n  dataset: ./datasets/foo.jsonl`);
    const result = await readTestSettings(ast);
    expect(result?.dataset).toBe("./datasets/foo.jsonl");
  });

  it("extracts evals array", async () => {
    const ast = astWithFrontmatter(
      `test_settings:\n  dataset: ./d.jsonl\n  evals:\n    - groundedness\n    - bleu_score`
    );
    const result = await readTestSettings(ast);
    expect(result?.evals).toEqual(["groundedness", "bleu_score"]);
  });

  it("extracts regression_tolerance when in valid range", async () => {
    const ast = astWithFrontmatter(`test_settings:\n  regression_tolerance: 0.05`);
    const result = await readTestSettings(ast);
    expect(result?.regression_tolerance).toBe(0.05);
  });

  it("rejects regression_tolerance > 1 (out of fractional range)", async () => {
    // 5 means 500%, almost certainly a unit confusion. Schema rejects.
    const ast = astWithFrontmatter(`test_settings:\n  regression_tolerance: 5`);
    expect(await readTestSettings(ast)).toBeUndefined();
  });

  it("rejects regression_tolerance < 0", async () => {
    const ast = astWithFrontmatter(`test_settings:\n  regression_tolerance: -0.1`);
    expect(await readTestSettings(ast)).toBeUndefined();
  });

  it("rejects regression_tolerance with wrong type", async () => {
    const ast = astWithFrontmatter(`test_settings:\n  regression_tolerance: "five percent"`);
    expect(await readTestSettings(ast)).toBeUndefined();
  });

  it("returns undefined on malformed yaml (does not throw)", async () => {
    // Unbalanced YAML — parser will throw, helper swallows.
    const ast = astWithFrontmatter(`test_settings:\n  dataset: "unclosed`);
    expect(await readTestSettings(ast)).toBeUndefined();
  });

  it("returns undefined when frontmatter is not an object", async () => {
    // A frontmatter that parses to a scalar (not an object) shouldn't crash.
    const ast = astWithFrontmatter(`just-a-string`);
    expect(await readTestSettings(ast)).toBeUndefined();
  });

  it("ignores unknown fields gracefully", async () => {
    // Zod's default mode strips unknown keys rather than erroring; this
    // protects against future-compat where new fields show up in frontmatter
    // that an older CLI doesn't understand.
    const ast = astWithFrontmatter(
      `test_settings:\n  dataset: ./d.jsonl\n  regression_tolerance: 0.1\n  future_field: "value"`
    );
    const result = await readTestSettings(ast);
    expect(result?.dataset).toBe("./d.jsonl");
    expect(result?.regression_tolerance).toBe(0.1);
  });

  it("returns an empty object (not undefined) for `test_settings: {}`", async () => {
    // Explicit empty block is structurally valid — represents "test_settings
    // exists but no fields configured." Distinguishable from "no block at all"
    // by truthy return.
    const ast = astWithFrontmatter(`test_settings: {}`);
    const result = await readTestSettings(ast);
    expect(result).toBeDefined();
    expect(result?.dataset).toBeUndefined();
    expect(result?.regression_tolerance).toBeUndefined();
  });
});
