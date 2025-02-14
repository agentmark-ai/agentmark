import { expect, test } from "vitest";
import { ModelPluginRegistry } from "@puzzlet/agentmark";

test("should be able to register all models cjs", async () => {
  const AllModels = require("../dist/index.cjs");
  ModelPluginRegistry.registerAll(AllModels.default);
  expect(true).toBe(true);
});

test("should be able to register all models esm", async () => {
  const AllModels = await import("../dist");
  ModelPluginRegistry.registerAll(AllModels.default);
  expect(true).toBe(true);
});
