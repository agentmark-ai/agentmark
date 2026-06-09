/**
 * Environment helpers for the adapter that `agentmark dev` spawns.
 *
 * `agentmark dev` is a LOCAL development server: it serves prompts and datasets
 * from the API server it starts. The client treats the presence of cloud creds
 * (AGENTMARK_API_KEY + AGENTMARK_APP_ID) as "use cloud", so without intervention
 * the spawned adapter would load *deployed* prompts/datasets from
 * api.agentmark.co and silently bypass the local files — local edits and
 * locally-preprocessed datasets would never reach it. These helpers keep the
 * spawned adapter pointed at the local dev server.
 */

/**
 * Whether both cloud credentials are present — the client's cloud-mode switch.
 * Empty-string values count as absent (an empty key never authenticates).
 */
export function hasCloudCreds(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.AGENTMARK_API_KEY && env.AGENTMARK_APP_ID);
}

/**
 * Build the env for the spawned dev adapter so it loads from the local API
 * server on `apiPort`.
 *
 * Strips the cloud creds (and any cloud `AGENTMARK_BASE_URL`) so the client
 * stays in local mode, and pins `AGENTMARK_DEV_SERVER` to this server. Returns a
 * copy — the input env is not mutated. Trace forwarding to prod is unaffected:
 * it's done by the dev process's own TraceForwarder using `agentmark link`
 * creds, not the adapter's env.
 */
export function buildAdapterEnv(env: NodeJS.ProcessEnv, apiPort: number): NodeJS.ProcessEnv {
  const adapterEnv: NodeJS.ProcessEnv = {
    ...env,
    AGENTMARK_DEV_SERVER: `http://localhost:${apiPort}`,
  };
  delete adapterEnv.AGENTMARK_API_KEY;
  delete adapterEnv.AGENTMARK_APP_ID;
  delete adapterEnv.AGENTMARK_BASE_URL;
  return adapterEnv;
}
