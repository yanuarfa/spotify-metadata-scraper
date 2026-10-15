import { describe, expect, test } from "bun:test";
import { handleRequest } from "../src/worker.ts";

const embedHtml = (entity: any) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { state: { data: { entity } } } },
  })}</script>`;

const trackEntity = {
  type: "track",
  id: "t1",
  uri: "spotify:track:t1",
  name: "Shape of You",
  artists: [{ name: "Ed Sheeran", uri: "spotify:artist:a1" }],
  releaseDate: { isoString: "2017-03-03T00:00:00Z" },
  duration: 233712,
  isExplicit: false,
  visualIdentity: { image: [{ url: "https://img/640", maxWidth: 640, maxHeight: 640 }] },
};

const fetchOk: typeof fetch = (async (input: any) => {
  const u = String(input);
  if (u.includes("open.spotify.com/embed/")) return new Response(embedHtml(trackEntity), { status: 200 });
  return new Response("nf", { status: 404 });
}) as typeof fetch;

describe("worker API", () => {
  test("GET / lists endpoints as JSON", async () => {
    const res = await handleRequest(new Request("https://w.test/"), fetchOk);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.runtime).toBe("cloudflare-workers");
    expect(body.endpoints.length).toBeGreaterThan(2);
  });

  test("GET /api/track/:id returns metadata with cache + CORS headers", async () => {
    const res = await handleRequest(new Request("https://w.test/api/track/t1"), fetchOk);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    const body: any = await res.json();
    expect(body.name).toBe("Shape of You");
    expect(body.artist).toBe("Ed Sheeran");
  });

  test("GET /api/scrape requires url, bad input is a 400 JSON error", async () => {
    const missing = await handleRequest(new Request("https://w.test/api/scrape"), fetchOk);
    expect(missing.status).toBe(400);
    expect(((await missing.json()) as any).error).toContain("url");

    const bad = await handleRequest(new Request("https://w.test/api/scrape?url=hello%20world"), fetchOk);
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as any).error).toContain("Text search is not supported");
  });

  test("POST /api/scrape accepts a batch and caps it at 10", async () => {
    const res = await handleRequest(
      new Request("https://w.test/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: ["spotify:track:t1", "spotify:track:t1"] }),
      }),
      fetchOk,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);

    const tooMany = await handleRequest(
      new Request("https://w.test/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: Array(11).fill("spotify:track:t1") }),
      }),
      fetchOk,
    );
    expect(tooMany.status).toBe(400);
  });

  test("unknown route is a 404 JSON error, OPTIONS answers CORS", async () => {
    const nf = await handleRequest(new Request("https://w.test/nope"), fetchOk);
    expect(nf.status).toBe(404);
    const opt = await handleRequest(new Request("https://w.test/api/scrape", { method: "OPTIONS" }), fetchOk);
    expect(opt.status).toBe(204);
    expect(opt.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
