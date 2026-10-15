import { describe, expect, test } from "bun:test";
import { searchDeezer, searchDiscovery, searchItunes } from "../src/search.ts";
import { handleRequest } from "../src/worker.ts";

const deezerBody = {
  data: [
    {
      id: 1375215242,
      title: "Into You",
      isrc: "USUM71601827",
      link: "https://www.deezer.com/track/1375215242",
      duration: 244,
      explicit_lyrics: false,
      preview: "https://cdnt-preview.dzcdn.net/preview.mp3",
      artist: { id: 1562681, name: "Ariana Grande" },
      album: { title: "Dangerous Woman", cover_xl: "https://img/xl.jpg", cover_medium: "https://img/m.jpg" },
    },
    {
      id: 130418118,
      title: "Into You (3LAU Remix)",
      duration: 197,
      explicit_lyrics: false,
      artist: { name: "Ariana Grande" },
      album: { title: "Into You (3LAU Remix)", cover_medium: "https://img/remix.jpg" },
    },
  ],
};

const itunesBody = {
  results: [
    {
      trackId: 111,
      trackName: "Into You",
      artistName: "Ariana Grande",
      collectionName: "Dangerous Woman",
      trackTimeMillis: 244000,
      trackExplicitness: "notExplicit",
      primaryGenreName: "Pop",
      artworkUrl100: "https://img/100x100bb.jpg",
      previewUrl: "https://audio/preview.m4a",
      trackViewUrl: "https://music.apple.com/track/111",
    },
    {
      trackId: 222,
      trackName: "Shape of You",
      artistName: "Ed Sheeran",
      collectionName: "÷ (Deluxe)",
      trackTimeMillis: 233712,
      trackExplicitness: "notExplicit",
      primaryGenreName: "Pop",
      artworkUrl100: "https://img2/100x100bb.jpg",
    },
  ],
};

const fetchMock: typeof fetch = (async (input: any) => {
  const u = String(input);
  if (u.includes("api.deezer.com")) return Response.json(deezerBody);
  if (u.includes("itunes.apple.com")) return Response.json(itunesBody);
  return new Response("nf", { status: 404 });
}) as typeof fetch;

describe("search providers", () => {
  test("deezer search maps fields incl. isrc from the search item itself", async () => {
    const out = await searchDeezer("into you", 10, fetchMock);
    expect(out[0]).toMatchObject({
      source: "deezer",
      name: "Into You",
      artist: "Ariana Grande",
      albumName: "Dangerous Woman",
      duration: 244,
      isrc: "USUM71601827",
      coverUrl: "https://img/xl.jpg",
    });
    expect(out[0].spotifySearchUrl).toContain("open.spotify.com/search/Into%20You");
  });

  test("itunes search maps fields and upgrades the cover to 600px", async () => {
    const out = await searchItunes("into you", 10, fetchMock);
    expect(out[0]).toMatchObject({ source: "itunes", genre: "Pop", duration: 244, isrc: null });
    expect(out[0].coverUrl).toBe("https://img/600x600bb.jpg");
  });

  test("discovery merges deezer first, dedupes itunes copies, keeps uniques", async () => {
    const payload = await searchDiscovery("into you", 10, fetchMock);
    expect(payload.results.map((r) => r.name)).toEqual(["Into You", "Into You (3LAU Remix)", "Shape of You"]);
    expect(payload.results[0].source).toBe("deezer");
    expect(payload.note).toContain("not Spotify IDs");
    expect(payload.count).toBe(3);
  });

  test("a failing provider does not sink the search", async () => {
    const halfBroken: typeof fetch = (async (input: any) =>
      String(input).includes("deezer") ? new Response("err", { status: 503 }) : Response.json(itunesBody)) as typeof fetch;
    const payload = await searchDiscovery("into you", 10, halfBroken);
    expect(payload.count).toBe(2);
    expect(payload.results[0].source).toBe("itunes");
  });
});

describe("worker /api/search", () => {
  test("missing q is a 400, a real query returns the merged payload", async () => {
    const bad = await handleRequest(new Request("https://w.test/api/search"), fetchMock);
    expect(bad.status).toBe(400);

    const res = await handleRequest(new Request("https://w.test/api/search?q=into%20you&limit=2"), fetchMock);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
    const body: any = await res.json();
    expect(body.count).toBe(2);
    expect(body.results[0].isrc).toBe("USUM71601827");
  });
});
