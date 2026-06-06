#!/usr/bin/env node
/**
 * Adapter scaffold generator.
 *
 *   node scripts/create-adapter.mjs <framework> [--major 0] [--peer <pkg>]
 *
 * Example:
 *   node scripts/create-adapter.mjs openai-agents --major 0 --peer @openai/agents
 *
 * Generates packages/<framework>-v<major>-adapter/ with the full required
 * surface from ADAPTER_REQUIREMENTS.md:
 *
 *   - Adapter class (adaptText/adaptObject/adaptImage/adaptSpeech) built on
 *     the shared applyParamMap + buildTelemetryMetadata helpers
 *   - Executor built with createExecutor (protocol correctness inherited),
 *     forwarding ctx.signal to the SDK seam
 *   - Model registry (exact / regex / default resolution)
 *   - createAgentMarkClient factory with PromptShape typing
 *   - Executor conformance test (runExecutorConformance in both stream
 *     modes + assertAbortStream) that is GREEN immediately: the one place
 *     that touches the real SDK is src/sdk.ts, and the test mocks that
 *     seam with scripted events
 *
 * Your job after generation is exactly one file: replace src/sdk.ts's
 * throwing stubs with real SDK calls (and extend the adapter's param maps
 * for your SDK's options). Everything else — wire protocol, usage
 * finalization, abort, error-as-terminal-event — is inherited.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.resolve(__dirname, "..", "packages");

// ---------- args ----------

const args = process.argv.slice(2);
const framework = args.find((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf("--" + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const major = flag("major", "0");
const peer = flag("peer", null);
// Test/CI override — generate somewhere other than packages/ (the scaffold
// regression test uses a throwaway tmp-* dir so module resolution still
// walks up to the workspace root's node_modules).
const packagesDir = flag("packages-dir", PACKAGES_DIR);

if (!framework || !/^[a-z][a-z0-9-]*$/.test(framework)) {
  console.error(
    "Usage: node scripts/create-adapter.mjs <framework> [--major 0] [--peer <pkg>]\n" +
      "  <framework> must be kebab-case, e.g. openai-agents"
  );
  process.exit(1);
}

const dirName = framework + "-v" + major + "-adapter";
const pkgName = "@agentmark-ai/" + dirName;
const adapterName = framework + "-v" + major;
const pascal = framework
  .split("-")
  .map((s) => s[0].toUpperCase() + s.slice(1))
  .join("");
const target = path.join(packagesDir, dirName);

if (fs.existsSync(target)) {
  console.error("Refusing to overwrite existing package: " + target);
  process.exit(1);
}

// ---------- templates ----------

const packageJson = {
  name: pkgName,
  version: "0.0.0",
  license: "AGPL-3.0-or-later",
  type: "module",
  main: "./dist/index.cjs",
  module: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      import: { types: "./dist/index.d.ts", default: "./dist/index.js" },
      require: { types: "./dist/index.d.cts", default: "./dist/index.cjs" },
    },
  },
  publishConfig: { access: "public" },
  scripts: {
    test: "vitest run",
    "test:coverage": "vitest run --coverage",
    "test:watch": "vitest",
    build: "tsup --format cjs,esm --dts --clean",
    lint: "eslint .",
  },
  devDependencies: {
    "@agentmark-ai/prompt-core": "*",
    "@types/node": "^22.8.1",
    tsup: "^8.3.5",
    typescript: "^5.6.2",
    vitest: "^4.1.8",
    ...(peer ? { [peer]: "*" } : {}),
  },
  peerDependencies: {
    "@agentmark-ai/prompt-core": "*",
    ...(peer ? { [peer]: "*" } : {}),
  },
  files: ["dist/"],
};

const tsconfig = `{
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "declarationDir": "./dist/types",
    "sourceMap": true,
    "moduleResolution": "bundler",
    "module": "ESNext",
    "target": "ES2019",
    "lib": ["ESNext"],
    "resolveJsonModule": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
`;

const tsupConfig = `import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2019',
  treeshake: true,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  esbuildOptions(options) {
    options.platform = 'node';
  },
});
`;

const vitestConfig = `import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
});
`;

const eslintConfig = `import baseConfig from "@agentmark-ai/eslint-config";

export default baseConfig;
`;

const sdkTs = `/**
 * The SDK seam — the ONLY file that talks to your framework's SDK.
 *
 * Replace each stub with real SDK calls (and update the mock in
 * test/executor-conformance.test.ts to mirror your SDK's real shapes).
 * Keeping the SDK behind this seam is what lets the conformance suite run
 * scripted and offline while the executor's translation logic stays fully
 * exercised.
 *
 * Honor the AbortSignal in every call — forward it to your SDK's request
 * (fetch signal, abortController option, etc.) so mid-stream cancellation
 * works end-to-end.
 */

export interface SdkTextChunk {
  type: "text-delta" | "finish";
  text?: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface SdkTextResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface SdkObjectResult {
  object: unknown;
  usage?: { inputTokens: number; outputTokens: number };
}

/** Streaming text call. TODO: call your SDK's streaming API. */
export async function* streamText(
  params: unknown,
  signal?: AbortSignal
): AsyncIterable<SdkTextChunk> {
  void params;
  void signal;
  throw new Error(
    "TODO(${dirName}): implement streamText against your SDK in src/sdk.ts"
  );
}

/** One-shot text call. TODO: call your SDK's generate API. */
export async function runText(
  params: unknown,
  signal?: AbortSignal
): Promise<SdkTextResult> {
  void params;
  void signal;
  throw new Error(
    "TODO(${dirName}): implement runText against your SDK in src/sdk.ts"
  );
}

/** One-shot structured-output call. TODO: call your SDK's object API. */
export async function runObject(
  params: unknown,
  signal?: AbortSignal
): Promise<SdkObjectResult> {
  void params;
  void signal;
  throw new Error(
    "TODO(${dirName}): implement runObject against your SDK in src/sdk.ts"
  );
}
`.replaceAll("${dirName}", dirName);

const modelRegistryTs = `import type { AdaptOptions } from "@agentmark-ai/prompt-core";

export type ModelFunctionCreator = (
  modelName: string,
  options?: AdaptOptions
) => unknown;

/**
 * Model registry: exact-name matches, regex pattern matches, and a default
 * creator fallback. Creators receive (modelName, options) — honor
 * options.apiKey / options.baseURL for auth and endpoint configuration.
 */
export class ${pascal}ModelRegistry {
  private exactMatches: Record<string, ModelFunctionCreator> = {};
  private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
  private defaultCreator?: ModelFunctionCreator;

  constructor(defaultCreator?: ModelFunctionCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerModels(
    modelPattern: string | RegExp | Array<string>,
    creator: ModelFunctionCreator
  ): this {
    if (typeof modelPattern === "string") {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      for (const model of modelPattern) this.exactMatches[model] = creator;
    } else {
      this.patternMatches.push([modelPattern, creator]);
    }
    return this;
  }

  getModelFunction(modelName: string): ModelFunctionCreator {
    if (this.exactMatches[modelName]) return this.exactMatches[modelName];
    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) return creator;
    }
    if (this.defaultCreator) return this.defaultCreator;
    throw new Error(
      "No model function found for: '" +
        modelName +
        "'. Register it with .registerModels()."
    );
  }
}
`;

const adapterTs = `import type {
  TextConfig,
  ObjectConfig,
  ImageConfig,
  SpeechConfig,
  PromptMetadata,
  AdaptOptions,
  PromptShape,
  ParamMap,
} from "@agentmark-ai/prompt-core";
import {
  applyParamMap,
  buildTelemetryMetadata,
} from "@agentmark-ai/prompt-core";
import { ${pascal}ModelRegistry } from "./model-registry";

/**
 * Declarative snake_case → SDK-native param renames. Extend these with the
 * options your SDK supports; unknown keys are dropped (adapters opt fields
 * in explicitly so the wire format stays predictable).
 */
const TEXT_PARAM_MAP: ParamMap = {
  temperature: "temperature",
  max_tokens: "maxTokens",
  top_p: "topP",
  seed: "seed",
  // TODO(${dirName}): map the rest of your SDK's settings.
};

const OBJECT_PARAM_MAP: ParamMap = {
  ...TEXT_PARAM_MAP,
  schema_name: "schemaName",
  schema_description: "schemaDescription",
};

export interface ${pascal}TextParams {
  model: unknown;
  messages: TextConfig["messages"];
  telemetry?: ReturnType<typeof buildTelemetryMetadata>;
  [param: string]: unknown;
}

export interface ${pascal}ObjectParams {
  model: unknown;
  messages: ObjectConfig["messages"];
  schema: unknown;
  telemetry?: ReturnType<typeof buildTelemetryMetadata>;
  [param: string]: unknown;
}

/**
 * Formats AgentMark prompt config into ${pascal}-native params. Pure
 * transformation, no I/O — the paired executor (src/executor.ts) runs the
 * result. If your SDK supports tools-by-name or MCP, extend BaseAdapter
 * from @agentmark-ai/prompt-core instead of implementing tool resolution
 * by hand (see ADAPTER_REQUIREMENTS.md).
 */
export class ${pascal}Adapter<T extends PromptShape<T>> {
  declare readonly __dict: T;
  readonly __name = "${adapterName}";

  constructor(private modelRegistry: ${pascal}ModelRegistry) {}

  async adaptText(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<${pascal}TextParams> {
    const { model_name: name, ...settings } = input.text_config;
    const model = this.modelRegistry.getModelFunction(name)(name, options);
    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      TEXT_PARAM_MAP
    );
    const telemetry = buildTelemetryMetadata(
      options.telemetry,
      metadata.props,
      input.name,
      input.agentmark_meta
    );
    return {
      model,
      messages: input.messages,
      ...mapped,
      ...(telemetry ? { telemetry } : {}),
    };
  }

  async adaptObject(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): Promise<${pascal}ObjectParams> {
    const { model_name: name, ...settings } = input.object_config;
    const model = this.modelRegistry.getModelFunction(name)(name, options);
    const mapped = applyParamMap(
      settings as Record<string, unknown>,
      OBJECT_PARAM_MAP
    );
    const telemetry = buildTelemetryMetadata(
      options.telemetry,
      metadata.props,
      input.name,
      input.agentmark_meta
    );
    return {
      model,
      messages: input.messages,
      schema: input.object_config.schema,
      ...mapped,
      ...(telemetry ? { telemetry } : {}),
    };
  }

  adaptImage(input: ImageConfig, _options: AdaptOptions): never {
    void input;
    // Declare image unsupported in the executor's capabilities() too.
    throw new Error("${adapterName} does not support image prompts");
  }

  adaptSpeech(input: SpeechConfig, _options: AdaptOptions): never {
    void input;
    throw new Error("${adapterName} does not support speech prompts");
  }
}
`
  .replaceAll("${pascal}", pascal)
  .replaceAll("${dirName}", dirName)
  .replaceAll("${adapterName}", adapterName);

const executorTs = `import { createExecutor } from "@agentmark-ai/prompt-core";
import { runObject, runText, streamText } from "./sdk";

/**
 * Executor built with createExecutor — the builder owns the protocol
 * invariants (exactly one terminal finish carrying usage, terminal-only
 * error events, tool-call/result ordering), so the handlers below only
 * translate SDK responses. ctx.signal is forwarded to every SDK call —
 * that's the cancellation channel (exercised by the abort conformance
 * test).
 */
export const ${pascal}Executor = createExecutor({
  name: "${adapterName}",
  capabilities: { text: true, object: true, image: false, speech: false },

  async text(formatted, ctx) {
    const result = await runText(formatted, ctx.signal);
    // The builder finalizes usage (totalTokens fallback, zero-defaults).
    return { text: result.text, usage: result.usage, finishReason: "stop" };
  },

  async *streamText(formatted, ctx) {
    for await (const chunk of streamText(formatted, ctx.signal)) {
      if (chunk.type === "text-delta" && chunk.text) {
        yield { type: "text-delta", text: chunk.text };
      } else if (chunk.type === "finish") {
        yield { type: "finish", reason: "stop", usage: chunk.usage };
      }
    }
  },

  async object(formatted, ctx) {
    const result = await runObject(formatted, ctx.signal);
    return { object: result.object, usage: result.usage, finishReason: "stop" };
  },
});
`
  .replaceAll("${pascal}", pascal)
  .replaceAll("${adapterName}", adapterName);

const indexTs = `import {
  AgentMark,
  type EvalRegistry,
  type Loader,
  type PromptShape,
} from "@agentmark-ai/prompt-core";
import { ${pascal}Adapter } from "./adapter";
import { ${pascal}ModelRegistry } from "./model-registry";

export { ${pascal}Adapter } from "./adapter";
export type { ${pascal}TextParams, ${pascal}ObjectParams } from "./adapter";
export { ${pascal}Executor } from "./executor";
export { ${pascal}ModelRegistry } from "./model-registry";
export type { ModelFunctionCreator } from "./model-registry";

export function createAgentMarkClient<
  D extends PromptShape<D> = PromptShape<Record<string, never>>
>(opts: {
  loader?: Loader<D>;
  modelRegistry: ${pascal}ModelRegistry;
  evals?: EvalRegistry;
}): AgentMark<D, ${pascal}Adapter<D>> {
  const adapter = new ${pascal}Adapter<D>(opts.modelRegistry);
  return new AgentMark<D, ${pascal}Adapter<D>>({
    loader: opts.loader,
    adapter,
    evals: opts.evals,
  });
}
`.replaceAll("${pascal}", pascal);

const conformanceTest = `/**
 * Executor conformance — green from the first run: the SDK seam
 * (../src/sdk) is mocked with scripted responses, so the executor's
 * translation logic is fully exercised offline. As you implement the real
 * seam, keep this mock mirroring your SDK's actual shapes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertAbortStream,
  assertUsageShape,
  runExecutorConformance,
} from "@agentmark-ai/prompt-core";

const scripted: {
  chunks: Array<Record<string, unknown>>;
  failOn?: (params: unknown) => boolean;
} = { chunks: [] };

vi.mock("../src/sdk", () => ({
  streamText: vi.fn(async function* (params: unknown, signal?: AbortSignal) {
    if (scripted.failOn?.(params)) throw new Error("scripted failure");
    for (const c of scripted.chunks) {
      if (signal?.aborted) return;
      yield c;
    }
  }),
  runText: vi.fn(async (params: unknown) => {
    if (scripted.failOn?.(params)) throw new Error("scripted failure");
    return { text: "ok", usage: { inputTokens: 1, outputTokens: 2 } };
  }),
  runObject: vi.fn(async (params: unknown) => {
    if (scripted.failOn?.(params)) throw new Error("scripted failure");
    return { object: { ok: true }, usage: { inputTokens: 1, outputTokens: 2 } };
  }),
}));

import { ${pascal}Executor } from "../src/executor";

beforeEach(() => {
  scripted.chunks = [
    { type: "text-delta", text: "hel" },
    { type: "text-delta", text: "lo" },
    { type: "finish", usage: { inputTokens: 2, outputTokens: 4 } },
  ];
  scripted.failOn = undefined;
});

describe("${pascal}Executor conformance", () => {
  it("passes the full suite in both stream modes", async () => {
    scripted.failOn = (p) =>
      typeof p === "object" && p !== null && "__explode" in p;
    await runExecutorConformance(${pascal}Executor, {
      text: {},
      object: {},
      errorInput: { __explode: true },
    });
  });

  it("finishes with canonical usage", async () => {
    const events: Array<Record<string, unknown>> = [];
    for await (const ev of ${pascal}Executor.executeText(
      {},
      { shouldStream: true }
    )) {
      events.push(ev as Record<string, unknown>);
    }
    const finish = events.at(-1) as {
      type: string;
      usage: { inputTokens: number; outputTokens: number };
    };
    expect(finish.type).toBe("finish");
    assertUsageShape(finish.usage);
  });

  it("aborts cleanly: signal reaches the SDK, no post-abort events", async () => {
    const { streamText } = await import("../src/sdk");
    let seenSignal: AbortSignal | undefined;
    vi.mocked(streamText).mockImplementationOnce(async function* (
      _params: unknown,
      signal?: AbortSignal
    ) {
      seenSignal = signal;
      // Endless stream — only the abort ends this run.
      while (!signal?.aborted) {
        yield { type: "text-delta", text: "tick" };
      }
    });

    const controller = new AbortController();
    const observed = await assertAbortStream(
      ${pascal}Executor.executeText(
        {},
        { shouldStream: true, signal: controller.signal }
      ),
      controller,
      { abortAfterEvents: 2 }
    );

    expect(seenSignal).toBe(controller.signal);
    expect(observed.map((e) => e.type)).toEqual(["text-delta", "text-delta"]);
  });
});
`.replaceAll("${pascal}", pascal);

const readme = `# ${pkgName}

AgentMark adapter for ${pascal} (scaffolded by scripts/create-adapter.mjs).

## Finish the integration

1. **src/sdk.ts** — replace the throwing stubs with real SDK calls. Forward
   the AbortSignal to your SDK's request. This is the only file that talks
   to the SDK.
2. **src/adapter.ts** — extend the param maps with your SDK's settings, and
   type \`${pascal}TextParams\` / \`${pascal}ObjectParams\` concretely. If your
   SDK supports tools-by-name or MCP, extend \`BaseAdapter\` from
   @agentmark-ai/prompt-core.
3. **test/executor-conformance.test.ts** — keep the seam mock mirroring your
   SDK's real shapes as you implement.
4. **package.json** — pin your SDK peer dependency to the supported range.
5. Add a \`.nx/version-plans/*.md\` entry before opening a PR (CI gates on
   \`release:plan:check\`).

The conformance suite (text/object/error in both stream modes + abort) is
green out of the box; keep it green. See ADAPTER_REQUIREMENTS.md at the repo
root for the full contract.
`;

// ---------- write ----------

const files = {
  "package.json": JSON.stringify(packageJson, null, 2) + "\n",
  "tsconfig.json": tsconfig,
  "tsup.config.ts": tsupConfig,
  "vitest.config.ts": vitestConfig,
  "eslint.config.mjs": eslintConfig,
  "README.md": readme,
  "src/sdk.ts": sdkTs,
  "src/model-registry.ts": modelRegistryTs,
  "src/adapter.ts": adapterTs,
  "src/executor.ts": executorTs,
  "src/index.ts": indexTs,
  "test/executor-conformance.test.ts": conformanceTest,
};

for (const [rel, content] of Object.entries(files)) {
  const file = path.join(target, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

console.log("Scaffolded " + pkgName + " at packages/" + dirName);
console.log("");
console.log("Next steps:");
console.log("  1. yarn install                  # register the new workspace");
console.log("  2. cd packages/" + dirName + " && yarn test");
console.log("     (conformance suite is green out of the box)");
console.log("  3. Implement src/sdk.ts against your SDK — see README.md");
if (peer) {
  console.log("  4. Pin the " + peer + " peer range in package.json");
}
console.log("");
console.log(
  "Reminder: OSS source changes need a .nx/version-plans/*.md entry."
);
