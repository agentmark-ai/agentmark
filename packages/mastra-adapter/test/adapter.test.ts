import { describe, it, expect } from "vitest";
import { MastraAdapter, MastraAgentRegistry, MastraToolRegistry } from "../src/adapter";

describe("MastraAdapter", () => {
  it("should create an adapter with the correct name", () => {
    const agentRegistry = new MastraAgentRegistry();
    const adapter = new MastraAdapter(agentRegistry);
    
    expect(adapter.__name).toBe("mastra");
  });

  it("should create agent registry with default creator", () => {
    const defaultCreator = () => ({} as any);
    const registry = new MastraAgentRegistry(defaultCreator);
    
    expect(registry).toBeInstanceOf(MastraAgentRegistry);
  });

  it("should create tool registry", () => {
    const registry = new MastraToolRegistry();
    
    expect(registry).toBeInstanceOf(MastraToolRegistry);
  });
});