import { describe, it, expect } from "vitest";
import { createAgentMark } from "../src";

const exactMatch = async () => ({ score: 1 });
const groundedness = async () => ({ score: 0 });

describe("createAgentMark scorers option", () => {
  it("registers scorers passed via the `scorers` option", () => {
    const client = createAgentMark({ scorers: { exactMatch, groundedness } });
    expect(client.getEvalNames().sort()).toEqual(["exactMatch", "groundedness"]);
    expect(client.getEvalRegistry().exactMatch).toBe(exactMatch);
  });

  it("still honors the deprecated `evals` alias", () => {
    const client = createAgentMark({ evals: { exactMatch } });
    expect(client.getEvalNames()).toEqual(["exactMatch"]);
  });

  it("prefers `scorers` over `evals` when both are given", () => {
    const client = createAgentMark({ scorers: { exactMatch }, evals: { groundedness } });
    expect(client.getEvalNames()).toEqual(["exactMatch"]);
  });
});
