/**
 * Zod schema tests for the public /v1/apps surface.
 *
 * The schemas are the source of truth for what an LLM agent can send.
 * Tight here = clearer 400 messages there.
 */

import { describe, it, expect } from "vitest";
import {
  CreateAppBodySchema,
  UpdateAppBodySchema,
  AppsListParamsSchema,
  AppSchema,
  APP_RUNTIME_VALUES,
} from "../schemas/apps";

describe("CreateAppBodySchema", () => {
  it("accepts a minimal body with only name", () => {
    const parsed = CreateAppBodySchema.safeParse({ name: "triage" });
    expect(parsed.success).toBe(true);
  });

  it("rejects empty name with a name-pathed issue", () => {
    const parsed = CreateAppBodySchema.safeParse({ name: "" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["name"]);
    }
  });

  it("rejects name > 100 chars", () => {
    const parsed = CreateAppBodySchema.safeParse({ name: "a".repeat(101) });
    expect(parsed.success).toBe(false);
  });

  it("strips null bytes from name", () => {
    const parsed = CreateAppBodySchema.safeParse({ name: "tri\u0000age" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("triage");
    }
  });

  it("accepts both supported runtimes", () => {
    for (const runtime of APP_RUNTIME_VALUES) {
      const parsed = CreateAppBodySchema.safeParse({ name: "x", runtime });
      expect(parsed.success).toBe(true);
    }
  });

  it("rejects unknown runtimes", () => {
    const parsed = CreateAppBodySchema.safeParse({ name: "x", runtime: "rust" });
    expect(parsed.success).toBe(false);
  });

  it("accepts an entry_point", () => {
    const parsed = CreateAppBodySchema.safeParse({
      name: "x",
      entry_point: "src/index.ts",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("UpdateAppBodySchema", () => {
  it("accepts a partial update", () => {
    const parsed = UpdateAppBodySchema.safeParse({ name: "renamed" });
    expect(parsed.success).toBe(true);
  });

  it("accepts entry_point: null (explicit clear)", () => {
    const parsed = UpdateAppBodySchema.safeParse({ entry_point: null });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty body (no fields supplied)", () => {
    const parsed = UpdateAppBodySchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toMatch(/at least one/i);
    }
  });

  it("rejects name > 100 chars", () => {
    const parsed = UpdateAppBodySchema.safeParse({ name: "a".repeat(101) });
    expect(parsed.success).toBe(false);
  });
});

describe("AppsListParamsSchema", () => {
  it("provides pagination defaults from the base schema", () => {
    const parsed = AppsListParamsSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.limit).toBeGreaterThan(0);
      expect(parsed.data.offset).toBeGreaterThanOrEqual(0);
    }
  });

  it("accepts a name filter", () => {
    const parsed = AppsListParamsSchema.safeParse({ name: "triage" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("triage");
    }
  });
});

describe("AppSchema (response shape)", () => {
  it("accepts a fully-populated row", () => {
    const parsed = AppSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
      name: "triage",
      runtime: "nodejs",
      entry_point: "src/index.ts",
      commit_sha: "abc123",
      fly_app_name: "triage-prod",
      fly_machine_id: "m-1",
      fly_machine_url: "https://triage.fly.dev",
      created_at: "2026-05-21T00:00:00Z",
      created_by: "u-1",
      updated_at: "2026-05-21T00:01:00Z",
      updated_by: "u-2",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts nullable fields as null", () => {
    const parsed = AppSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
      name: "triage",
      runtime: null,
      entry_point: null,
      commit_sha: null,
      fly_app_name: null,
      fly_machine_id: null,
      fly_machine_url: null,
      created_at: null,
      created_by: null,
      updated_at: null,
      updated_by: null,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects unknown runtime values", () => {
    const parsed = AppSchema.safeParse({
      id: "11111111-1111-4111-8111-111111111111",
      tenant_id: "22222222-2222-4222-8222-222222222222",
      name: "triage",
      runtime: "java",
      entry_point: null,
      commit_sha: null,
      fly_app_name: null,
      fly_machine_id: null,
      fly_machine_url: null,
      created_at: null,
      created_by: null,
      updated_at: null,
      updated_by: null,
    });
    expect(parsed.success).toBe(false);
  });
});
