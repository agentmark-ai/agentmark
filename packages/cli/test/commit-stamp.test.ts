/**
 * Prompt-version trace linking — local dev server commit stamping.
 *
 * Unit tests for `cli-src/utils/commit-stamp.ts` plus an e2e against the real
 * api-server: a `/v1/templates` prompt response from a git-tracked project
 * must carry the repo HEAD sha inside the AST frontmatter
 * (`agentmark_meta.commit_sha`) — mirroring the cloud gateway's stamping so
 * local traces link to the exact prompt version.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "child_process";
import type { Server } from "http";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { parse as yamlParse } from "yaml";
import {
  injectCommitShaIntoAst,
  resolveLocalCommitSha,
} from "../cli-src/utils/commit-stamp";

function yamlAst(value: string): any {
  return { children: [{ type: "yaml", value }] };
}

describe("injectCommitShaIntoAst", () => {
  it("injects agentmark_meta.commit_sha into the frontmatter yaml node", () => {
    const ast = yamlAst("name: greet\ntext_config:\n  model_name: test");
    injectCommitShaIntoAst(ast, "abc123");
    const fm = yamlParse(ast.children[0].value);
    expect(fm).toEqual({
      name: "greet",
      text_config: { model_name: "test" },
      agentmark_meta: { commit_sha: "abc123" },
    });
  });

  it("merges with existing agentmark_meta keys and overwrites a stale commit_sha", () => {
    const ast = yamlAst(
      "name: greet\nagentmark_meta:\n  commit_sha: old-sha\n  other: keep",
    );
    injectCommitShaIntoAst(ast, "new-sha");
    const fm = yamlParse(ast.children[0].value);
    expect(fm.agentmark_meta).toEqual({ commit_sha: "new-sha", other: "keep" });
  });

  it("no-ops (and never throws) for null sha, missing yaml node, or malformed input", () => {
    const ast = yamlAst("name: greet");
    injectCommitShaIntoAst(ast, null);
    expect(yamlParse(ast.children[0].value)).toEqual({ name: "greet" });

    const noYaml: any = { children: [{ type: "paragraph" }] };
    injectCommitShaIntoAst(noYaml, "sha");
    expect(noYaml.children).toEqual([{ type: "paragraph" }]);

    injectCommitShaIntoAst(null, "sha"); // must not throw
    injectCommitShaIntoAst({ children: "not-an-array" }, "sha"); // must not throw
  });
});

describe("resolveLocalCommitSha", () => {
  it("returns null outside a git repository", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "am-nogit-"));
    // GIT_CEILING is not set; a tmpdir is normally outside any repo, but a
    // repo-containing tmp is conceivable — accept null OR a 40-hex sha is
    // too loose. Force non-repo by pointing at a dir with GIT_DIR unset and
    // asserting against a fresh, definitely-untracked directory tree.
    const result = resolveLocalCommitSha(dir);
    // mkdtemp dirs on CI runners are not inside a git work tree.
    expect(result).toBeNull();
  });

  it("returns the repo HEAD sha inside a git repository", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "am-git-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf-8" }).trim();
    git("init", "-q");
    fs.writeFileSync(path.join(dir, "f.txt"), "x", "utf-8");
    git("add", "f.txt");
    git(
      "-c", "user.email=test@example.com",
      "-c", "user.name=Test",
      "-c", "commit.gpgsign=false",
      "commit", "-q", "-m", "init",
    );
    const head = git("rev-parse", "HEAD");

    expect(resolveLocalCommitSha(dir)).toBe(head);
    expect(head).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("/v1/templates stamps the local HEAD commit (e2e)", () => {
  let server: Server;
  let port: number;
  let tmpRoot: string;
  let originalCwd: string;
  let headSha: string;

  beforeAll(async () => {
    originalCwd = process.cwd();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "am-commit-stamp-"));

    // Minimal agentmark project: agentmark.json marks the project root.
    // No `agentmarkPath` override — templates live at `<root>/agentmark/`.
    fs.writeFileSync(
      path.join(tmpRoot, "agentmark.json"),
      JSON.stringify({ mdxVersion: "1.0" }),
      "utf-8",
    );
    const promptDir = path.join(tmpRoot, "agentmark");
    fs.mkdirSync(promptDir, { recursive: true });
    fs.writeFileSync(
      path.join(promptDir, "hello.prompt.mdx"),
      "---\nname: hello\ntext_config:\n  model_name: test/model\n---\n\n<User>hi</User>\n",
      "utf-8",
    );

    // Make the project a git repo so HEAD resolves.
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: tmpRoot, encoding: "utf-8" }).trim();
    git("init", "-q");
    git("add", ".");
    git(
      "-c", "user.email=test@example.com",
      "-c", "user.name=Test",
      "-c", "commit.gpgsign=false",
      "commit", "-q", "-m", "init",
    );
    headSha = git("rev-parse", "HEAD");

    process.chdir(tmpRoot);
    port = 19000 + Math.floor(Math.random() * 500);
    const { createApiServer } = await import("../cli-src/api-server");
    server = (await createApiServer(port)) as Server;
  }, 60000);

  afterAll(async () => {
    process.chdir(originalCwd);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("stamps the repo HEAD into the AST's agentmark_meta frontmatter", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/v1/templates?path=hello.prompt.mdx&promptKind=text`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: any };

    // Canonical `{ data }` envelope only — same shape as the cloud gateway.
    expect(Object.keys(body)).toEqual(["data"]);

    // The AST frontmatter carries the served-at sha for the runner to read.
    const findYaml = (node: any): any => {
      if (node?.type === "yaml") return node;
      for (const child of node?.children ?? []) {
        const hit = findYaml(child);
        if (hit) return hit;
      }
      return null;
    };
    const yamlNode = findYaml(body.data);
    expect(yamlNode).not.toBeNull();
    const fm = yamlParse(yamlNode.value);
    expect(fm.agentmark_meta).toEqual({ commit_sha: headSha });
    expect(fm.name).toBe("hello");
  });
});
