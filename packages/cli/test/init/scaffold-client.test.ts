import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { scaffoldClient, clientFileName } from "../../cli-src/commands/init/scaffold-client";

/**
 * `agentmark init` scaffolds the provider-agnostic client so a coding agent
 * doesn't reconstruct it (and fabricate the `ApiLoader` import path). These
 * tests pin the two things that actually matter: the file is named per the
 * language, its imports are the canonical ones (ApiLoader from the /loader-api
 * SUBPATH, not the root — the bug we're preventing), and an existing client is
 * never clobbered.
 */
describe("scaffoldClient", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-scaffold-"));
  });
  afterEach(() => {
    fs.removeSync(tmp);
  });

  it("writes agentmark.client.ts for a TypeScript project with the correct loader-api subpath import", () => {
    const result = scaffoldClient(tmp, "typescript");

    expect(result).toEqual({ fileName: "agentmark.client.ts", written: true });
    const body = fs.readFileSync(path.join(tmp, "agentmark.client.ts"), "utf8");
    // The whole point: ApiLoader comes from the subpath, NOT the package root.
    expect(body).toContain('import { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";');
    expect(body).toContain('import { createAgentMark } from "@agentmark-ai/prompt-core";');
    // Never collapse the two imports onto the root — that makes ApiLoader undefined.
    expect(body).not.toContain('import { createAgentMark, ApiLoader } from "@agentmark-ai/prompt-core"');
    // Loader gates on the app id (not the API key) and exports a `client`.
    expect(body).toContain("process.env.AGENTMARK_APP_ID");
    expect(body).toContain("export const client = createAgentMark(");
  });

  it("writes agentmark_client.py for a Python project importing from agentmark.prompt_core", () => {
    const result = scaffoldClient(tmp, "python");

    expect(result).toEqual({ fileName: "agentmark_client.py", written: true });
    const body = fs.readFileSync(path.join(tmp, "agentmark_client.py"), "utf8");
    expect(body).toContain("from agentmark.prompt_core import create_agentmark, ApiLoader");
    expect(body).toContain('os.environ.get("AGENTMARK_APP_ID")');
    expect(body).toContain("client = create_agentmark(");
  });

  it("never clobbers an existing client file", () => {
    const filePath = path.join(tmp, "agentmark.client.ts");
    fs.writeFileSync(filePath, "// my hand-tuned client\n");

    const result = scaffoldClient(tmp, "typescript");

    expect(result).toEqual({ fileName: "agentmark.client.ts", written: false });
    expect(fs.readFileSync(filePath, "utf8")).toBe("// my hand-tuned client\n");
  });

  it("clientFileName maps language to the right filename", () => {
    expect(clientFileName("typescript")).toBe("agentmark.client.ts");
    expect(clientFileName("python")).toBe("agentmark_client.py");
  });

  // The TS and Python clients are two renderings of ONE contract; pin the shared
  // invariants so the templates can't drift apart (e.g. one gets re-gated on the
  // API key, or loses the cloud branch). Language-native syntax differs; the
  // SHAPE must not.
  it("both languages encode the same client contract", () => {
    const read = (lang: "typescript" | "python") => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-contract-"));
      const { fileName } = scaffoldClient(dir, lang);
      const body = fs.readFileSync(path.join(dir, fileName), "utf8");
      fs.removeSync(dir);
      return body;
    };

    for (const body of [read("typescript"), read("python")]) {
      // Loader gated on the app id (NOT the API key — that's the doc-warned bug).
      expect(body).toContain("AGENTMARK_APP_ID");
      // Both branches of the loader present (dev + linked-to-cloud).
      expect(body).toMatch(/ApiLoader\.cloud/);
      expect(body).toMatch(/ApiLoader\.local/);
      // Local dev points at the dev API server port.
      expect(body).toContain("9418");
      // Evals registered and a `client` created.
      expect(body.toLowerCase()).toContain("exact_match");
      expect(body).toMatch(/client = create_?[Aa]gent[Mm]ark/);
    }
  });
});
