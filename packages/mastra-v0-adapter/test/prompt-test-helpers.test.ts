/**
 * Unit tests for MastraTextPrompt / MastraObjectPrompt test-helper methods:
 *   - formatAgentWithTestProps  (compiles using test_settings.props)
 *   - formatAgentWithDataset    (streams one formatted row per dataset entry,
 *                                or throws when no loader/dataset is available)
 *
 * These methods power AgentMark's "run with test props" and dataset experiment
 * flows. They were previously uncovered (text-prompt.ts 97-155,
 * object-prompt.ts 85-143).
 *
 * @mastra/core/agent is mocked because formatAgent builds an AgentConfig that
 * downstream callers feed to a Mastra Agent — we only need the config shape,
 * not a live LLM.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { FileLoader } from "@agentmark-ai/loader-file";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

vi.mock("@mastra/core/agent", () => ({
  Agent: class MockAgent {},
}));

const base = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures"
);

function makeClient() {
  const loader = new FileLoader(base);
  const modelRegistry = new MastraModelRegistry();
  modelRegistry.registerModels(
    "test-model",
    () => ({ name: "test-model" } as any)
  );
  return createAgentMarkClient({ loader, modelRegistry });
}

async function readStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const out: T[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out.push(value);
  }
  return out;
}

beforeAll(async () => {
  await setupFixtures();
});

afterAll(() => cleanupFixtures());

let client: ReturnType<typeof makeClient>;
beforeEach(() => {
  vi.clearAllMocks();
  client = makeClient();
});

describe("MastraTextPrompt — formatAgentWithTestProps", () => {
  it("compiles the User message from test_settings.props", async () => {
    const prompt = await client.loadTextPrompt(
      "text-props.prompt.mdx" as any
    );

    const agent = await prompt.formatAgentWithTestProps({});
    const [messages] = await agent.formatMessages();

    const user = messages.find((m) => m.role === "user");
    expect(JSON.stringify(user)).toContain("From test props");
  });
});

describe("MastraTextPrompt — formatAgentWithDataset", () => {
  it("throws when neither loader dataset nor datasetPath is available", async () => {
    const prompt = await client.loadTextPrompt(
      "text-no-dataset.prompt.mdx" as any
    );

    await expect(prompt.formatAgentWithDataset()).rejects.toThrow(
      /Loader or dataset is not defined/
    );
  });

  it("streams one formatted row per dataset entry with input, evals, and formatted output", async () => {
    const prompt = await client.loadTextPrompt(
      "text-props.prompt.mdx" as any
    );

    const stream = await prompt.formatAgentWithDataset();
    const rows = await readStream(stream);

    // text.dataset.jsonl has exactly 2 rows.
    expect(rows.length).toBe(2);

    expect(rows[0].dataset.input).toEqual({ userMessage: "What is 2+2?" });
    expect(rows[0].dataset.expected_output).toBe("4");
    expect(rows[0].evals).toEqual(["exact_match"]);
    expect(rows[0].formatted.name).toBe("text-props");

    expect(rows[1].dataset.input).toEqual({ userMessage: "Say hello" });
    expect(rows[1].dataset.expected_output).toBe("Hello");
    expect(rows[1].evals).toEqual(["exact_match"]);

    // The formatted output must reflect the row's input, not the test props.
    const [messages] = await rows[1].formatted.formatMessages();
    const user = messages.find((m) => m.role === "user");
    expect(JSON.stringify(user)).toContain("Say hello");
  });

  it("honors datasetPath override when test_settings has no dataset", async () => {
    const prompt = await client.loadTextPrompt(
      "text-no-dataset.prompt.mdx" as any
    );

    const stream = await prompt.formatAgentWithDataset({
      datasetPath: "text.dataset.jsonl",
    });
    const rows = await readStream(stream);

    expect(rows.length).toBe(2);
    expect(rows[0].dataset.input).toEqual({ userMessage: "What is 2+2?" });
    // No test_settings.evals on this prompt — evals default to [].
    expect(rows[0].evals).toEqual([]);
  });

  it("applies sampling to return only selected rows", async () => {
    const prompt = await client.loadTextPrompt(
      "text-props.prompt.mdx" as any
    );

    const stream = await prompt.formatAgentWithDataset({
      sampling: { rows: [1] },
    });
    const rows = await readStream(stream);

    expect(rows.length).toBe(1);
    expect(rows[0].dataset.input).toEqual({ userMessage: "Say hello" });
  });
});

describe("MastraObjectPrompt — formatAgentWithTestProps", () => {
  it("compiles the User message from test_settings.props", async () => {
    const prompt = await client.loadObjectPrompt(
      "object-props.prompt.mdx" as any
    );

    const agent = await prompt.formatAgentWithTestProps({});
    const [messages] = await agent.formatMessages();

    const user = messages.find((m) => m.role === "user");
    expect(JSON.stringify(user)).toContain("From test props");
  });
});

describe("MastraObjectPrompt — formatAgentWithDataset", () => {
  it("throws when neither loader dataset nor datasetPath is available", async () => {
    const prompt = await client.loadObjectPrompt(
      "object-no-dataset.prompt.mdx" as any
    );

    await expect(prompt.formatAgentWithDataset()).rejects.toThrow(
      /Loader or dataset is not defined/
    );
  });

  it("streams one formatted row per dataset entry with input, evals, and formatted output", async () => {
    const prompt = await client.loadObjectPrompt(
      "object-props.prompt.mdx" as any
    );

    const stream = await prompt.formatAgentWithDataset();
    const rows = await readStream(stream);

    // object.dataset.jsonl has exactly 1 row.
    expect(rows.length).toBe(1);
    expect(rows[0].dataset.input).toEqual({ userMessage: "Provide ok:true" });
    expect(rows[0].dataset.expected_output).toEqual({ ok: true });
    expect(rows[0].evals).toEqual(["exact_match"]);
    expect(rows[0].formatted.name).toBe("object-props");

    const [messages] = await rows[0].formatted.formatMessages();
    const user = messages.find((m) => m.role === "user");
    expect(JSON.stringify(user)).toContain("Provide ok:true");
  });

  it("honors datasetPath override when test_settings has no dataset", async () => {
    const prompt = await client.loadObjectPrompt(
      "object-no-dataset.prompt.mdx" as any
    );

    const stream = await prompt.formatAgentWithDataset({
      datasetPath: "object.dataset.jsonl",
    });
    const rows = await readStream(stream);

    expect(rows.length).toBe(1);
    expect(rows[0].dataset.input).toEqual({ userMessage: "Provide ok:true" });
    expect(rows[0].evals).toEqual([]);
  });
});
