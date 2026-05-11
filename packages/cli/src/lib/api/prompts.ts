import { API_URL } from "../../config/api";

interface ListPromptsResponse {
  data?: { paths?: string[] };
  // Forward-compat shim for any older OSS api-server peer still emitting
  // the flat shape. Will go away once we ratchet the lower bound.
  paths?: string[];
}

interface ConfigResponse {
  data?: { config?: { agentmarkPath?: string } };
}

/**
 * Resolve a prompt's frontmatter `name` to its file path **relative to the
 * project root** — e.g. `agentmark/prompts/my_prompt.prompt.mdx`.
 *
 * Hits `GET /v1/prompts?name=X`, which the api-server (OSS) and gateway
 * (cloud) both expose with the same shared schema (`ListPromptsQuerySchema`
 * / `ListPromptsResponseSchema` in `@agentmark-ai/api-schemas`). The
 * server walks the filesystem (OSS) or the `template` Supabase table
 * (cloud) and returns matching paths.
 *
 * Returns null when there's no exact unique match — either no prompt
 * carries that frontmatter `name`, or the name collides across folders
 * (the platform's `(app_id, name, parent_path, file_extension)` uniqueness
 * constraint allows that). The caller treats both cases as "missing." A
 * future PR could surface the collision case with a richer return type;
 * for now the single-result contract is enough for the dialog.
 */
export async function getPromptPathByName(name: string): Promise<string | null> {
  if (!name) return null;

  const [paths, prefix] = await Promise.all([
    fetchMatchingPaths(name),
    fetchTemplatesPrefix(),
  ]);

  if (paths.length !== 1) return null;
  return `${prefix}/${paths[0]}`;
}

async function fetchMatchingPaths(name: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${API_URL}/v1/prompts?name=${encodeURIComponent(name)}`,
    );
    if (!res.ok) return [];
    const body = (await res.json()) as ListPromptsResponse;
    // TODO(envelope-cleanup): drop the `body?.paths` fallback once every
    // OSS api-server peer in the wild has been republished with the
    // `{ data: { paths } }` envelope (this PR was the cutover). Sister
    // shims live in `cli-src/runner-server.ts` and
    // `shared-utils/src/generate-types.ts` — remove all three together.
    const paths = body?.data?.paths ?? body?.paths;
    return Array.isArray(paths) ? paths : [];
  } catch {
    return [];
  }
}

// `/v1/config` returns the parsed `agentmark.json`. Default layout puts
// the `agentmark/` folder at the project root; users can move it via
// `agentmarkPath`. 404 = no config = default layout.
async function fetchTemplatesPrefix(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/v1/config`);
    if (!res.ok) return "agentmark";
    const body = (await res.json()) as ConfigResponse;
    const customParent = body.data?.config?.agentmarkPath;
    return customParent ? `${customParent}/agentmark` : "agentmark";
  } catch {
    return "agentmark";
  }
}
