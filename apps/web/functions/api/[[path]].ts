/**
 * Cloudflare Pages Function — API proxy
 *
 * Forwards every request to /api/* transparently to the Worker.
 * This runs at the edge inside the Pages deployment, so the browser
 * always talks to the same origin (no CORS, no hardcoded Worker URL in
 * the JS bundle).
 *
 * Required Pages environment variable (set in Cloudflare dashboard):
 *   API_URL  →  https://illustrator-api.<account>.workers.dev
 *               (no trailing slash)
 */

interface Env {
  API_URL: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;

  if (!env.API_URL) {
    return new Response(
      JSON.stringify({ error: 'API_URL environment variable is not set' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Reconstruct the target URL on the Worker
  const originalUrl = new URL(request.url);
  const pathSegments = Array.isArray(params.path) ? params.path : [params.path];
  const targetUrl = `${env.API_URL}/api/${pathSegments.join('/')}${originalUrl.search}`;

  // Forward the request verbatim (method, headers, body)
  const proxied = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    // @ts-expect-error — duplex is required for streaming bodies in some runtimes
    duplex: 'half',
  });

  return fetch(proxied);
};
