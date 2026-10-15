import { describe, expect, test } from "bun:test";
import { normalizeIsrc, resolveFromMusicbrainz, resolveIsrc } from "../src/resolve.ts";
import { handleRequest } from "../src/worker.ts";

const mbBody = {
  recordings: [
    { title: "Into You", "artist-credit": [{ name: "Ariana Grande" }], relations: [] },
    {
      title: "Into You",
      "artist-credit": [{ name: "Ariana Grande" }],
      relations: [
        { type: "free streaming", url: { resource: "https://www.deezer.com/track/1375215242" } },
        { type: "free streaming", url: { resource: "https://open.spotify.com/track/49gRYU6hBWgSH2JVixGkJq" } },
      ],
    },
  ],
};

const fetchMb: typeof fetch = (async (input: any) => {
  const u = String(input);
  if (u.includes("musicbrainz.org/ws/2/isrc/USUM71601827")) return Response.json(mbBody);
  if (u.includes("musicbrainz.org")) return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
  return new Response("nf", { status: 404 });
}) as typeof fetch;

describe("normalizeIsrc", () => {
  test("accepts plain and dashed, rejects junk", () => {
    expect(normalizeIsrc("USUM71601827")).toBe("USUM71601827");
    expect(normalizeIsrc("us-um7-16-01827")).toBe("USUM71601827");
    expect(normalizeIsrc("abc")).toBeNull();
    expect(normalizeIsrc("USUM7160182")).toBeNull();
  });
});

describe("resolveFromMusicbrainz", () => {
  test("scans past recordings without a spotify relation", () => {
    const out = resolveFromMusicbrainz(mbBody, "USUM71601827");
    expect(out).toMatchObject({
      spotifyId: "49gRYU6hBWgSH2JVixGkJq",
      spotifyUrl: "https://open.spotify.com/track/49gRYU6hBWgSH2JVixGkJq",
      recordingTitle: "Into You",
      recordingArtist: "Ariana Grande",
      source: "musicbrainz",
    });
  });

  test("album links and empty payloads do not count as a match", () => {
    const albumOnly = {
      recordings: [
        { title: "X", relations: [{ type: "free streaming", url: { resource: "https://open.spotify.com/album/abc123" } }] },
      ],
    };
    expect(resolveFromMusicbrainz(albumOnly, "USUM71601827")).toBeNull();
    expect(resolveFromMusicbrainz({}, "USUM71601827")).toBeNull();
    expect(resolveFromMusicbrainz(null, "USUM71601827")).toBeNull();
  });

  test("unknown isrc (musicbrainz 404) resolves to null, not an error", async () => {
    await expect(resolveIsrc("ZZZZZ0000000", fetchMb)).resolves.toBeNull();
    await expect(resolveIsrc("bukan-isrc", fetchMb)).rejects.toThrow("Invalid ISRC");
  });
});

describe("worker /api/resolve", () => {
  test("400 without or with invalid isrc, 404 when unlinked, 200 with long cache when found", async () => {
    const missing = await handleRequest(new Request("https://w.test/api/resolve"), fetchMb);
    expect(missing.status).toBe(400);

    const invalid = await handleRequest(new Request("https://w.test/api/resolve?isrc=abc"), fetchMb);
    expect(invalid.status).toBe(400);

    const unlinked = await handleRequest(new Request("https://w.test/api/resolve?isrc=ZZZZZ0000000"), fetchMb);
    expect(unlinked.status).toBe(404);

    const found = await handleRequest(new Request("https://w.test/api/resolve?isrc=USUM71601827"), fetchMb);
    expect(found.status).toBe(200);
    expect(found.headers.get("Cache-Control")).toContain("max-age=86400");
    const body: any = await found.json();
    expect(body.spotifyId).toBe("49gRYU6hBWgSH2JVixGkJq");
  });
});
