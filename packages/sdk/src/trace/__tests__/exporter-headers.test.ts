import { describe, it, expect } from "vitest";
import { buildTraceExporterHeaders } from "../tracing";

describe("buildTraceExporterHeaders", () => {
  it("includes auth + app id and omits selectors when unset", () => {
    expect(buildTraceExporterHeaders("key-1", "app-1")).toEqual({
      Authorization: "key-1",
      "X-Agentmark-App-Id": "app-1",
    });
  });

  it("adds X-Agentmark-Environment when an environment is set", () => {
    expect(buildTraceExporterHeaders("key-1", "app-1", "production")).toEqual({
      Authorization: "key-1",
      "X-Agentmark-App-Id": "app-1",
      "X-Agentmark-Environment": "production",
    });
  });

  it("adds X-Agentmark-Pr-Number (stringified) when a PR number is set", () => {
    expect(
      buildTraceExporterHeaders("key-1", "app-1", undefined, 1234),
    ).toEqual({
      Authorization: "key-1",
      "X-Agentmark-App-Id": "app-1",
      "X-Agentmark-Pr-Number": "1234",
    });
  });

  it("includes both selectors when both are set", () => {
    expect(buildTraceExporterHeaders("k", "a", "pr-1234", 1234)).toEqual({
      Authorization: "k",
      "X-Agentmark-App-Id": "a",
      "X-Agentmark-Environment": "pr-1234",
      "X-Agentmark-Pr-Number": "1234",
    });
  });

  it("treats PR number 0 as present (the != null guard, not truthiness)", () => {
    expect(
      buildTraceExporterHeaders("k", "a", undefined, 0)["X-Agentmark-Pr-Number"],
    ).toBe("0");
  });
});
