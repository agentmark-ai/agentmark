import { describe, it, expect, vi } from "vitest";
import { getInferenceAdapter } from "../src/utils";
import { VercelAdapter } from "../src/vercel-adapter";
import { Adapter } from "@agentmark/agentmark-core";

describe("Utils", () => {
  describe("getInferenceAdapter", () => {
    it("should return VercelAdapter for vercel-ai-v4 adapter", () => {
      const mockAdapter = {
        __name: "vercel-ai-v4",
      } as Adapter<any>;

      const result = getInferenceAdapter(mockAdapter);

      expect(result).toBeInstanceOf(VercelAdapter);
    });

    it("should throw error for unsupported adapter", () => {
      const mockAdapter = {
        __name: "unsupported-adapter",
      } as Adapter<any>;

      expect(() => getInferenceAdapter(mockAdapter)).toThrow(
        "Unsupported adapter: unsupported-adapter"
      );
    });

    it("should throw error for adapter with undefined name", () => {
      const mockAdapter = {
        __name: undefined,
      } as any;

      expect(() => getInferenceAdapter(mockAdapter)).toThrow(
        "Unsupported adapter: undefined"
      );
    });
  });
});