/**
 * Scaffolds the AgentMark client file during `agentmark init`.
 *
 * The client (`agentmark.client.ts` / `agentmark_client.py`) is the ONE wiring
 * file that is entirely provider-agnostic — it's a loader + scorers, with no LLM
 * SDK call in it (that lives in the executor inside the agent-authored
 * `dev-entry`/`handler`). Because it's generic, init can write it correctly
 * here instead of leaving a coding agent to reconstruct it from docs — which is
 * how the import path got fabricated: `ApiLoader` is exported from the
 * `@agentmark-ai/prompt-core/loader-api` SUBPATH, not the package root, and
 * importing it from the root makes it `undefined` so the dev-entry crashes at
 * load. Scaffolding the canonical file removes that whole failure mode.
 *
 * Deliberately NOT scaffolded: `dev-entry.ts`/`handler.ts` (their executor is
 * SDK-specific) and the runtime deps (`@agentmark-ai/prompt-core` etc.) — the
 * skill's setup workflow installs those for the stack the user actually picks.
 *
 * Non-destructive: an existing client is never overwritten.
 *
 * Templates are kept verbatim-aligned with the canonical Client setup docs
 * (https://docs.agentmark.co/getting-started/client-setup.md), minus the
 * `agentmark.types` generic — `generate-types` hasn't run at init time, so the
 * client starts untyped (the docs sanction this: "safe to start without type
 * arguments").
 */

import fs from "fs-extra";
import path from "path";
import type { ProjectLanguage } from "../../utils/project";

const TS_CLIENT = `import { createAgentMark } from "@agentmark-ai/prompt-core";
import { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";

// Local dev (no app id): prompts come from \`agentmark dev\`'s API server.
// Linked to cloud (app id present): prompts come from AgentMark Cloud.
// Gate on AGENTMARK_APP_ID, not the API key — the key also powers tracing, so
// keying off it would silently repoint prompt-loading to Cloud (404s until
// you've deployed) the moment you enable traces.
const loader = process.env.AGENTMARK_APP_ID
  ? ApiLoader.cloud({
      apiKey: process.env.AGENTMARK_API_KEY!,
      appId: process.env.AGENTMARK_APP_ID,
      baseUrl: process.env.AGENTMARK_BASE_URL,
    })
  : ApiLoader.local({ baseUrl: "http://localhost:9418" });

// Scorers register here; the webhook runner sources them from the client, so they
// run in Cloud experiments and list in the Dashboard's New Experiment dialog.
// Start with one and add as you go — \`passed\` is what run-experiment's
// --threshold gate counts.
export const client = createAgentMark({
  loader,
  scorers: {
    exact_match: ({ output, expectedOutput }) => ({
      score: output === expectedOutput ? 1 : 0,
      passed: output === expectedOutput,
    }),
  },
});
`;

const PY_CLIENT = `import os

from dotenv import load_dotenv
from agentmark.prompt_core import create_agentmark, ApiLoader

load_dotenv()

# Local dev (no app id): prompts come from \`agentmark dev\`'s API server.
# Linked to cloud (app id present): prompts come from AgentMark Cloud.
# Gate on AGENTMARK_APP_ID, not the API key — the key also powers tracing, so
# keying off it would silently repoint prompt-loading to Cloud (404s until
# you've deployed) the moment you enable traces.
if os.environ.get("AGENTMARK_APP_ID"):
    loader = ApiLoader.cloud(
        api_key=os.environ["AGENTMARK_API_KEY"],
        app_id=os.environ["AGENTMARK_APP_ID"],
    )
else:
    loader = ApiLoader.local(base_url="http://localhost:9418")


# Scorers register here; the webhook runner sources them from the client, so they
# run in Cloud experiments and list in the New Experiment dialog. Start with one
# and add as you go — "passed" is what run-experiment's --threshold gate counts.
def exact_match(params):
    match = params["output"] == params.get("expectedOutput")
    return {"score": 1.0 if match else 0.0, "passed": match}


client = create_agentmark(loader=loader, scorers={"exact_match": exact_match})
`;

/** The client filename for a given project language. */
export function clientFileName(language: ProjectLanguage): string {
  return language === "python" ? "agentmark_client.py" : "agentmark.client.ts";
}

export interface ScaffoldClientResult {
  /** The client filename (agentmark.client.ts | agentmark_client.py). */
  fileName: string;
  /** True when the file was written; false when one already existed (kept). */
  written: boolean;
}

/**
 * Writes the provider-agnostic client for `language` at `targetPath`, unless a
 * client file already exists there (never clobbered).
 */
export function scaffoldClient(targetPath: string, language: ProjectLanguage): ScaffoldClientResult {
  const fileName = clientFileName(language);
  const filePath = path.join(targetPath, fileName);
  if (fs.existsSync(filePath)) return { fileName, written: false };
  fs.writeFileSync(filePath, language === "python" ? PY_CLIENT : TS_CLIENT);
  return { fileName, written: true };
}
