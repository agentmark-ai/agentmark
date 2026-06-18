import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AgentMarkSDK } from "../agentmark";

describe("AgentMarkSDK.score source", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ data: {} }) }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function postedBody() {
    const init = fetchMock.mock.calls[0]![1] as any;
    return JSON.parse(init.body);
  }

  it("defaults source to 'api' for a direct score() call", async () => {
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a" });
    await sdk.score({ resourceId: "trace-1", name: "acc", score: 1, label: "", reason: "" });
    expect(postedBody().source).toBe("api");
  });

  it("passes an explicit source through unchanged", async () => {
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a" });
    await sdk.score({ resourceId: "trace-1", name: "acc", score: 1, label: "", reason: "", source: "experiment" });
    expect(postedBody().source).toBe("experiment");
  });
});
