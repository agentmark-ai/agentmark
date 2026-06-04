import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { createSignature, verifySignature } from "../src/hmac-256-signature";

/** Independent reference implementation to cross-check the WebCrypto one. */
function referenceSignature(secret: string, payload: string): string {
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

describe("createSignature", () => {
  it("matches an independent HMAC-SHA256 reference (exact hex, lowercase, 64 chars)", async () => {
    const sig = await createSignature("topsecret", "the-payload");
    expect(sig).toBe(referenceSignature("topsecret", "the-payload"));
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("falls back to the 'DEFAULT' key when the secret is empty", async () => {
    const withEmpty = await createSignature("", "payload");
    expect(withEmpty).toBe(referenceSignature("DEFAULT", "payload"));
    // And empty is therefore NOT the same as signing with a different key.
    expect(withEmpty).not.toBe(referenceSignature("", "payload"));
  });

  it("produces different signatures for different payloads under the same secret", async () => {
    const a = await createSignature("k", "a");
    const b = await createSignature("k", "b");
    expect(a).not.toBe(b);
  });
});

describe("verifySignature", () => {
  it("accepts a signature produced for the same secret + payload", async () => {
    const sig = await createSignature("secret", "hello world");
    expect(await verifySignature("secret", sig, "hello world")).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const sig = await createSignature("secret", "hello world");
    expect(await verifySignature("secret", sig, "HELLO WORLD")).toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    const sig = await createSignature("secret-a", "msg");
    expect(await verifySignature("secret-b", sig, "msg")).toBe(false);
  });

  it("uses the 'DEFAULT' key on both sides when the secret is empty", async () => {
    const sig = await createSignature("", "msg");
    expect(await verifySignature("", sig, "msg")).toBe(true);
    // A real "DEFAULT" signature also verifies under an empty secret.
    expect(await verifySignature("", referenceSignature("DEFAULT", "msg"), "msg")).toBe(true);
  });

  it("parses the hex from the part after '=' in the header", async () => {
    const hex = createHmac("sha256", "DEFAULT").update("msg").digest("hex");
    // Header carries the raw hex after the algorithm prefix.
    expect(await verifySignature("DEFAULT", `sha256=${hex}`, "msg")).toBe(true);
  });
});
