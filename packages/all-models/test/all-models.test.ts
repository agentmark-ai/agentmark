import { expect, test } from "vitest";
import { ModelPluginRegistry } from "@puzzlet/agentmark";

test("should be able to register all models cjs", async () => {
  await expect(new Promise(async (resolve, reject) => {
    try {
      const AllModels = require("../dist/index.cjs");
      ModelPluginRegistry.registerAll(AllModels.default);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  })).resolves.not.toThrow();
});

test("should be able to register all models esm", async () => {
  await expect(new Promise(async (resolve, reject) => {
    try {
      const AllModels = await import("../dist/index.js");
      ModelPluginRegistry.registerAll(AllModels.default);
      resolve(true);
    } catch (error) {
      reject(error);
    }
  })).resolves.not.toThrow();
});
