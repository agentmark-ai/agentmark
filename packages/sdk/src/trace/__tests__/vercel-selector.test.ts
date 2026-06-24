import { describe, it, expect } from "vitest";
import { deriveVercelSelector } from "../tracing";

describe("deriveVercelSelector", () => {
  it("returns the PR number for a preview deploy from a pull request", () => {
    expect(
      deriveVercelSelector({
        VERCEL_ENV: "preview",
        VERCEL_GIT_PULL_REQUEST_ID: "123",
        VERCEL_GIT_COMMIT_REF: "feature-x",
      }),
    ).toEqual({ prNumber: 123 });
  });

  it("falls back to the branch ref for a preview deploy with no open PR", () => {
    expect(
      deriveVercelSelector({
        VERCEL_ENV: "preview",
        VERCEL_GIT_PULL_REQUEST_ID: "",
        VERCEL_GIT_COMMIT_REF: "feature-x",
      }),
    ).toEqual({ environment: "feature-x" });
  });

  it("returns nothing for a preview deploy with neither PR nor ref", () => {
    expect(deriveVercelSelector({ VERCEL_ENV: "preview" })).toEqual({});
  });

  it("maps development to the default dev env", () => {
    expect(deriveVercelSelector({ VERCEL_ENV: "development" })).toEqual({
      environment: "dev",
    });
  });

  it("leaves production to the key's pin (ambiguous to auto-name)", () => {
    expect(deriveVercelSelector({ VERCEL_ENV: "production" })).toEqual({});
  });

  it("returns nothing when not running on Vercel", () => {
    expect(deriveVercelSelector({})).toEqual({});
  });

  it("ignores a non-numeric PR id and falls back to the ref", () => {
    expect(
      deriveVercelSelector({
        VERCEL_ENV: "preview",
        VERCEL_GIT_PULL_REQUEST_ID: "not-a-number",
        VERCEL_GIT_COMMIT_REF: "branch-y",
      }),
    ).toEqual({ environment: "branch-y" });
  });
});
