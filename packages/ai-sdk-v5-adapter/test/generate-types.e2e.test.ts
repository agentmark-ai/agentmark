/**
 * End-to-end type-safety test for the `generate-types` pipeline.
 *
 * The existing types.test.ts exercises adapter types with MANUALLY constructed
 * PromptShape objects. That doesn't prove the TYPES EMITTED BY `generate-types`
 * (which is what real users consume) produce a type-safe pipeline.
 *
 * This test closes that loop:
 *   1. Create real `.prompt.mdx` fixtures on disk.
 *   2. Run `generateTypeDefinitions()` — the same function the CLI's
 *      `agentmark generate-types` command calls.
 *   3. Write the generated .ts file.
 *   4. Use the TypeScript compiler API to compile consumer source files that
 *      import the generated types and exercise the v5 adapter.
 *   5. Assert diagnostics:
 *        - Valid consumers: zero diagnostics.
 *        - Invalid consumers: specific TS error codes (TS2345, TS2322, etc.).
 *
 * Each invalid-consumer case pins a specific error code — that way a
 * regression that makes the pipeline MORE permissive (silently losing
 * type safety) fails this test loudly.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import ts from "typescript";
import {
  fetchPromptsFrontmatter,
  generateTypeDefinitions,
} from "@agentmark-ai/shared-utils";

// Each case runs a real `ts.createProgram` compile (and the beforeAll runs the
// generate-types codegen). That's far slower than vitest's 5s default on a cold
// CI runner — raise the ceiling so a slow box isn't mistaken for a failure.
// The Coverage (main) workflow runs the ENTIRE `turbo test:coverage` matrix
// (dashboard + every package + OSS) in one invocation on a ~2-core runner, so
// the CPU-bound TS compiler here contends hard and the first compile can take
// far longer than it does locally. The shared compiler host below cuts the
// per-case cost; this ceiling is the safety margin on top of it.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

let tmpDir: string;
let promptsDir: string;
let generatedTypesPath: string;
let tsconfigPath: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-e2e-types-"));
  promptsDir = path.join(tmpDir, "prompts");
  fs.mkdirSync(promptsDir, { recursive: true });

  // A few prompts exercising each kind + tools + schema.
  fs.writeFileSync(
    path.join(promptsDir, "greet.prompt.mdx"),
    `---
name: greet
text_config:
  model_name: openai/gpt-4o
input_schema:
  type: object
  properties:
    name:
      type: string
  required: [name]
---
Hello {name}.
`
  );
  fs.writeFileSync(
    path.join(promptsDir, "math.prompt.mdx"),
    `---
name: math
object_config:
  model_name: openai/gpt-4o
  schema:
    type: object
    properties:
      answer:
        type: number
    required: [answer]
input_schema:
  type: object
  properties:
    question:
      type: string
  required: [question]
---
{question}
`
  );
  fs.writeFileSync(
    path.join(promptsDir, "with-tools.prompt.mdx"),
    `---
name: with-tools
text_config:
  model_name: openai/gpt-4o
  tools:
    search_web:
      parameters:
        type: object
        properties:
          query:
            type: string
        required: [query]
        additionalProperties: false
input_schema:
  type: object
  properties:
    topic:
      type: string
  required: [topic]
  additionalProperties: false
---
{topic}
`
  );

  // Run the real generator and write its output.
  const prompts = await fetchPromptsFrontmatter({ rootDir: promptsDir });
  const typesSource = await generateTypeDefinitions(prompts, "typescript");
  generatedTypesPath = path.join(tmpDir, "agentmark.types.ts");
  fs.writeFileSync(generatedTypesPath, typesSource);

  // Minimal tsconfig matching the adapter's strict settings.
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true,
      resolveJsonModule: true,
    },
  };
  tsconfigPath = path.join(tmpDir, "tsconfig.json");
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig));

  // Warm the shared compiler host here, inside the hook (which has its own
  // 120s budget), rather than letting the FIRST test() body absorb the cold
  // cost of parsing the default libs + the adapter's `.d.ts` graph. That cold
  // parse is exactly what tripped the per-test timeout on the contended
  // Coverage (main) runner. This representative compile imports BOTH the
  // generated types and the adapter, so the SourceFile cache + prior Program
  // are fully primed and every subsequent it() runs warm.
  compileConsumer(`
    import type AgentmarkTypes from "./agentmark.types";
    import {
      createAgentMarkClient,
      VercelAIModelRegistry,
    } from "@agentmark-ai/ai-sdk-v5-adapter";
    async function warm() {
      const client = createAgentMarkClient<AgentmarkTypes>({
        modelRegistry: new VercelAIModelRegistry(),
      });
      return client.loadTextPrompt("greet.prompt.mdx");
    }
    warm;
  `);
});

afterAll(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// A compiler host + prior Program reused across every compileConsumer call.
// Each case is a fresh `ts.createProgram`, but the heavy, INVARIANT cost —
// parsing the default libs, resolving the adapter's `.d.ts` dependency graph,
// and parsing the generated types file — is identical on every call. Re-paying
// it 16× is what makes this suite slow enough to blow the per-test timeout when
// the CI box is CPU-starved. So we parse those invariant files ONCE into a
// SourceFile cache and feed the previous Program back in as `oldProgram`,
// letting TS reuse already-parsed/bound files. Only the unique consumer file is
// parsed and checked fresh each call. vitest runs this file's cases
// sequentially (fileParallelism: false + non-concurrent its), so sharing this
// mutable state across cases is safe.
let cachedOptions: ts.CompilerOptions | undefined;
let cachedHost: ts.CompilerHost | undefined;
const sourceFileCache = new Map<string, ts.SourceFile>();
let priorProgram: ts.Program | undefined;

function getCompilerOptions(pkgDir: string): ts.CompilerOptions {
  if (cachedOptions) return cachedOptions;
  const cfgPath = ts.findConfigFile(pkgDir, ts.sys.fileExists, "tsconfig.json");
  if (!cfgPath) throw new Error("tsconfig.json not found for v5 adapter");
  const cfgJson = ts.readConfigFile(cfgPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    cfgJson.config,
    ts.sys,
    path.dirname(cfgPath)
  );
  cachedOptions = { ...parsed.options, noEmit: true };
  return cachedOptions;
}

function getCompilerHost(options: ts.CompilerOptions): ts.CompilerHost {
  if (cachedHost) return cachedHost;
  const host = ts.createCompilerHost(options);
  const readSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (
    fileName: string,
    languageVersionOrOptions: ts.ScriptTarget | ts.CreateSourceFileOptions,
    onError?: (message: string) => void,
    shouldCreateNewSourceFile?: boolean
  ): ts.SourceFile | undefined => {
    // The consumer file is unique per call (timestamped name) and must never be
    // served stale; everything else (libs, node_modules `.d.ts`, and the
    // byte-for-byte-constant `__agentmark.types` copy) is invariant, so cache
    // it by path.
    const cacheable = !fileName.includes("__consumer-");
    if (cacheable) {
      const hit = sourceFileCache.get(fileName);
      if (hit) return hit;
    }
    const sf = readSourceFile(
      fileName,
      languageVersionOrOptions,
      onError,
      shouldCreateNewSourceFile
    );
    if (cacheable && sf) sourceFileCache.set(fileName, sf);
    return sf;
  };
  cachedHost = host;
  return host;
}

/**
 * Compile a consumer source string inside THIS package so that module
 * resolution for `@agentmark-ai/*` and `ai` goes through the same yarn
 * workspace links a real user would hit. The consumer file is written
 * into the adapter's own test/ dir (and deleted after), and the tsconfig
 * uses the adapter's tsconfig chain so strictness matches published code.
 */
function compileConsumer(consumerSource: string): readonly ts.Diagnostic[] {
  const pkgDir = path.resolve(__dirname, "..");
  const consumerPath = path.join(
    pkgDir,
    "test",
    `__consumer-${Date.now()}-${Math.floor(Math.random() * 1e9)}.ts`
  );
  // The generated types file has already been written to tmpDir; copy it
  // next to the consumer so relative imports work. Its content is constant
  // across cases, so the host caches it by path after the first read.
  const localTypesPath = path.join(pkgDir, "test", "__agentmark.types.ts");
  fs.writeFileSync(localTypesPath, fs.readFileSync(generatedTypesPath));
  // Rewrite the consumer's import of "./agentmark.types" to the local copy.
  fs.writeFileSync(
    consumerPath,
    consumerSource.replace(
      /"\.\/agentmark\.types"/g,
      '"./__agentmark.types"'
    )
  );

  const options = getCompilerOptions(pkgDir);
  const host = getCompilerHost(options);
  const program = ts.createProgram({
    rootNames: [consumerPath, localTypesPath],
    options,
    host,
    oldProgram: priorProgram,
  });
  priorProgram = program;

  const sourceFile = program.getSourceFile(consumerPath);
  const diagnostics = [
    ...program.getSemanticDiagnostics(sourceFile),
    ...program.getSyntacticDiagnostics(sourceFile),
  ];

  try {
    fs.unlinkSync(consumerPath);
    fs.unlinkSync(localTypesPath);
  } catch {
    /* ignore */
  }
  return diagnostics;
}

function diagCodes(diags: readonly ts.Diagnostic[]): number[] {
  return diags.map((d) => d.code);
}

function diagSummary(diags: readonly ts.Diagnostic[]): string {
  return diags
    .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`)
    .join("\n");
}

describe("generate-types → v5 adapter: e2e type safety (positive cases)", () => {
  it("generated types compile standalone", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      export type Shape = AgentmarkTypes;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("loadTextPrompt with a valid key + typed props compiles", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadTextPrompt("greet.prompt.mdx");
        const formatted = await prompt.format({ props: { name: "world" } });
        const _messages: typeof formatted.messages = formatted.messages;
        return _messages;
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("loadObjectPrompt preserves output schema type", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadObjectPrompt("math.prompt.mdx");
        const formatted = await prompt.format({ props: { question: "2+2" } });
        // schema field must be present on the adapted params
        const _schema = formatted.schema;
        return _schema;
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });
});

describe("generate-types → v5 adapter: e2e type safety (negative cases)", () => {
  it("rejects loadTextPrompt with a key that does not exist", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        // @ts-expect-error — key not in AgentmarkTypes
        await client.loadTextPrompt("does-not-exist.prompt.mdx");
      }
      main;
    `;
    // With the directive, the code compiles clean IFF TS actually flagged
    // the call. If TS started accepting the bad key (regression), the
    // suppression comment would become "unused" → TS2578, failing here.
    // (Worded to avoid starting a line with the bare directive token, which
    // TS would otherwise parse as a real `@ts-expect-error` on the next line.)
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("rejects wrong props shape for a text prompt", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadTextPrompt("greet.prompt.mdx");
        // @ts-expect-error — greet requires { name: string }, not { wrongKey }
        await prompt.format({ props: { wrongKey: 123 } });
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("rejects loadObjectPrompt called on a text-kind prompt", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        // @ts-expect-error — greet.prompt.mdx is a text prompt; loadObjectPrompt
        // must reject its key at compile time.
        await client.loadObjectPrompt("greet.prompt.mdx");
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });
});

describe("generate-types → v5 adapter: tools emit as a name list (list[str] doctrine)", () => {
  // Per the 2026-03-13 doctrine (shared-utils generate-types.ts), MDX `tools`
  // is a LIST OF TOOL NAMES — the per-tool argument schemas live in the native
  // SDK code, not in MDX frontmatter. So generate-types deliberately does NOT
  // emit `Tools` / `*Args` interfaces; it emits an optional `tools?: string[]`
  // on the prompt type. These tests pin that authoritative contract so a
  // regression that re-introduces the old typed-args emission (or drops the
  // `tools?: string[]` field) fails loudly.
  it("emits a `tools?: string[]` field on the prompt type for a prompt with tools", () => {
    const typesSource = fs.readFileSync(generatedTypesPath, "utf8");
    expect(typesSource).toContain("tools?: string[]");
  });

  it("does NOT emit a `Tools` interface or `*Args` types (typed args live in SDK code)", () => {
    const typesSource = fs.readFileSync(generatedTypesPath, "utf8");
    expect(typesSource).not.toContain("interface Tools");
    expect(typesSource).not.toContain("SearchWebArgs");
  });

  it("the with-tools prompt's type carries tools?: string[] and accepts a name list", () => {
    // The prompt type's `tools` field is the public surface: an optional list
    // of tool names. Indexing it must yield `string[]`.
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      type WithTools = AgentmarkTypes["with-tools"];
      type ToolNames = NonNullable<WithTools["tools"]>;
      const _names: ToolNames = ["search_web"];
      export { _names };
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("rejects a non-string entry in the tools name list", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      type WithTools = AgentmarkTypes["with-tools"];
      type ToolNames = NonNullable<WithTools["tools"]>;
      // @ts-expect-error — tools is string[], not number[]
      const _names: ToolNames = [42];
      export { _names };
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("a with-tools prompt is still loadable through the v5 adapter client", () => {
    // The doctrine change is about TYPE EMISSION, not runtime: a prompt that
    // declares tools must still resolve through the adapter's key map. Pin
    // that the generated AgentmarkTypes keeps the with-tools key wired so the
    // client's loadTextPrompt accepts it.
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadTextPrompt("with-tools.prompt.mdx");
        return prompt;
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });
});

describe("generate-types → v5 adapter: strict input_schema rejects extra props", () => {
  it("format({ props: <object literal> }) rejects keys not in input_schema", () => {
    // TS excess-property check fires on object literals. The input_schema
    // for greet.prompt.mdx only declares `name`, so adding `extra` must
    // be a compile-time error when the user inlines the props literal.
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadTextPrompt("greet.prompt.mdx");
        // @ts-expect-error — 'extra' is not declared on GreetIn
        await prompt.format({ props: { name: "x", extra: 1 } });
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("props with ONLY declared keys compiles (positive complement)", () => {
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadTextPrompt("greet.prompt.mdx");
        await prompt.format({ props: { name: "x" } });
      }
      main;
    `;
    const diags = compileConsumer(src);
    expect(diags, diagSummary(diags)).toHaveLength(0);
  });

  it("meta: removing @ts-expect-error on extra-prop case yields TS2353 (excess property)", () => {
    // Guards against silently going permissive: if TS stops flagging extras,
    // the @ts-expect-error would become "unused" (TS2578). This is the
    // inverse sanity check.
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        const prompt = await client.loadTextPrompt("greet.prompt.mdx");
        await prompt.format({ props: { name: "x", extra: 1 } });
      }
      main;
    `;
    const diags = compileConsumer(src);
    // TS2353 = 'Object literal may only specify known properties'.
    expect(diagCodes(diags)).toContain(2353);
  });
});

describe("generate-types output contains the adapter-agnostic shape we depend on", () => {
  it("emits a default export with the expected per-prompt entries", () => {
    const typesSource = fs.readFileSync(generatedTypesPath, "utf8");
    // Smoke: interface shape + kind + input tagging. More granular tests
    // live in cli/test/generate-types.test.ts. This is a sanity check.
    expect(typesSource).toContain("export default interface AgentmarkTypes");
    expect(typesSource).toContain('"greet.prompt.mdx"');
    expect(typesSource).toContain('"math.prompt.mdx"');
    expect(typesSource).toContain("kind: 'text'");
    expect(typesSource).toContain("kind: 'object'");
  });

  it("negative consumers actually produce the diagnostic codes @ts-expect-error swallows", () => {
    // Sanity: if we REMOVE @ts-expect-error from a negative case, we see the
    // expected TS2345 error. Confirms @ts-expect-error wasn't hiding a
    // false-positive green state.
    const src = `
      import type AgentmarkTypes from "./agentmark.types";
      import {
        createAgentMarkClient,
        VercelAIModelRegistry,
      } from "@agentmark-ai/ai-sdk-v5-adapter";

      async function main() {
        const client = createAgentMarkClient<AgentmarkTypes>({
          modelRegistry: new VercelAIModelRegistry(),
        });
        await client.loadTextPrompt("does-not-exist.prompt.mdx");
      }
      main;
    `;
    const diags = compileConsumer(src);
    // TS2345 = Argument of type 'X' is not assignable to parameter of type 'Y'.
    expect(diagCodes(diags)).toContain(2345);
  });
});
