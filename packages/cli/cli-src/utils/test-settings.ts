/**
 * Helpers for extracting `test_settings` from a prompt AST.
 *
 * The frontmatter is already part of the AST (the yaml node in `ast.children`).
 * Rather than pre-extracting individual fields at AST-load time and growing
 * the loader's return type for every new test config knob, callers read
 * `test_settings` from the AST on demand via this helper.
 *
 * Validation runs against the canonical Zod schema in `@agentmark-ai/prompt-core`,
 * so malformed values (typos, out-of-range numbers, wrong types) yield
 * `undefined` rather than poisoning downstream gate decisions silently.
 */

import type { Root } from "mdast";
import { TestSettingsSchema } from "@agentmark-ai/prompt-core";
import type { TestSettings } from "@agentmark-ai/prompt-core";

/**
 * Read and validate the `test_settings` block from a prompt AST's
 * frontmatter. Returns `undefined` when:
 *
 * - The AST has no yaml node
 * - The yaml fails to parse
 * - `test_settings` is missing
 * - The block fails Zod validation
 *
 * Callers should treat a missing return value the same as "no test_settings
 * configured" — never as a hard error — because frontmatter typos are
 * user-facing and shouldn't crash a run.
 */
export async function readTestSettings(ast: Root): Promise<TestSettings | undefined> {
  const yamlNode: { type?: string; value?: string } | undefined = (ast as { children?: Array<{ type?: string; value?: string }> })
    ?.children?.find((n) => n?.type === "yaml");
  if (!yamlNode?.value) return undefined;

  let parsed: unknown;
  try {
    const { parse: parseYaml } = await import("yaml");
    parsed = parseYaml(yamlNode.value);
  } catch {
    return undefined;
  }

  const candidate = (parsed as Record<string, unknown> | undefined)?.test_settings;
  const result = TestSettingsSchema.safeParse(candidate);
  return result.success ? result.data : undefined;
}
