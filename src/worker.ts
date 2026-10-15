import { enrichTrackWithItunes, scrapeSpotify, type SpotifyMeta } from "./scraper.ts";

const KINDS = ["track", "album", "playlist", "artist", "episode", "show"] as const;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });
}

function cacheControlFor(meta: SpotifyMeta): string {
  const maxAge = meta.type === "playlist" || meta.type === "artist" ? 300 : 3600;
  return `public, max-age=${maxAge}`;
}

async function scrapeOne(input: string, enrich: boolean, fetchFn: typeof fetch): Promise<SpotifyMeta> {
  let meta = await scrapeSpotify(input, fetchFn);
  if (enrich && meta.type === "track") meta = await enrichTrackWithItunes(meta, fetchFn);
  return meta;
}

function isBadInput(e: unknown): boolean {
  return e instanceof Error && (e.message.startsWith("Unrecognized Spotify input") || e.message.startsWith("Embed page carried no entity"));
}

export async function handleRequest(req: Request, fetchFn: typeof fetch = fetch): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const enrich = url.searchParams.get("enrich") === "1";

  try {
    if ((req.method === "GET" || req.method === "HEAD") && path === "/") {
      return json({
        name: "spotify-metadata-scraper",
        runtime: "cloudflare-workers",
        source: "spotify-embed (no credentials)",
        endpoints: [
          "GET /api/scrape?url=<spotify url|uri>[&enrich=1]",
          "GET /api/track/:id | /api/album/:id | /api/playlist/:id | /api/artist/:id [&enrich=1]",
          'POST /api/scrape { "url": "..." } | { "urls": ["...", "..."] }',
          "GET /health",
        ],
      });
    }

    if ((req.method === "GET" || req.method === "HEAD") && path === "/health") return json({ ok: true });

    if (req.method === "GET" && path === "/api/scrape") {
      const input = url.searchParams.get("url") ?? url.searchParams.get("uri");
      if (!input) return json({ error: "Missing query param: url (a Spotify URL or spotify:<kind>:<id> URI)" }, 400);
      const meta = await scrapeOne(input, enrich, fetchFn);
      return json(meta, 200, { "Cache-Control": cacheControlFor(meta) });
    }

    const perKind = path.match(/^\/api\/(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)$/);
    if (req.method === "GET" && perKind) {
      const meta = await scrapeOne(`spotify:${perKind[1]}:${perKind[2]}`, enrich, fetchFn);
      return json(meta, 200, { "Cache-Control": cacheControlFor(meta) });
    }

    if (req.method === "POST" && path === "/api/scrape") {
      const body: any = await req.json().catch(() => null);
      const inputs: string[] = Array.isArray(body?.urls) ? body.urls : body?.url ? [body.url] : [];
      if (!inputs.length) return json({ error: 'Body must be { "url": "..." } or { "urls": ["...", ...] }' }, 400);
      if (inputs.length > 10) return json({ error: "At most 10 URLs per request" }, 400);
      const results = await Promise.all(inputs.map((i) => scrapeOne(String(i), enrich, fetchFn)));
      return json(results.length === 1 ? results[0] : results, 200, {
        "Cache-Control": cacheControlFor(results[0]),
      });
    }

    return json({ error: `Not found: ${req.method} ${path}` }, 404);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, isBadInput(e) ? 400 : 502);
  }
}

export default {
  fetch: (req: Request) => handleRequest(req),
};
