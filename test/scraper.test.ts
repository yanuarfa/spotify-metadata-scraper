import { describe, expect, test } from "bun:test";
import { embedDataToMeta, parseEmbedNextData, parseSpotifyInput } from "../src/scraper.ts";

function dataOf(entity: any) {
  return { props: { pageProps: { state: { data: { entity } } } } };
}

describe("parseSpotifyInput", () => {
  test("url, intl url, and uri", () => {
    expect(parseSpotifyInput("https://open.spotify.com/track/abc123?si=x")).toEqual({ kind: "track", id: "abc123" });
    expect(parseSpotifyInput("https://open.spotify.com/intl-id/album/xyz789")).toEqual({ kind: "album", id: "xyz789" });
    expect(parseSpotifyInput("spotify:playlist:p1")).toEqual({ kind: "playlist", id: "p1" });
  });
  test("text search is rejected explicitly", () => {
    expect(() => parseSpotifyInput("ariana grande into you")).toThrow("Text search is not supported");
  });
});

describe("embed parsing", () => {
  test("single track keeps artists, cover, preview", () => {
    const meta: any = embedDataToMeta(
      dataOf({
        type: "track",
        id: "t1",
        uri: "spotify:track:t1",
        name: "Shape of You",
        artists: [{ name: "Ed Sheeran", uri: "spotify:artist:a1" }],
        releaseDate: { isoString: "2017-03-03T00:00:00Z" },
        duration: 233712,
        isExplicit: false,
        isPlayable: true,
        audioPreview: { url: "https://p.scdn.co/preview" },
        visualIdentity: {
          image: [
            { url: "https://img/300", maxWidth: 300, maxHeight: 300 },
            { url: "https://img/640", maxWidth: 640, maxHeight: 640 },
          ],
        },
      }),
    );
    expect(meta.name).toBe("Shape of You");
    expect(meta.artists).toEqual([{ name: "Ed Sheeran", id: "a1", uri: "spotify:artist:a1" }]);
    expect(meta.duration).toBe(234);
    expect(meta.year).toBe(2017);
    expect(meta.coverUrl).toBe("https://img/640"); // largest, not first
    expect(meta.previewUrl).toContain("p.scdn.co");
  });

  test("album trackList: artists come from subtitle, track numbers from order", () => {
    const meta: any = embedDataToMeta(
      dataOf({
        type: "album",
        id: "al1",
        uri: "spotify:album:al1",
        name: "÷ (Deluxe)",
        subtitle: "Ed Sheeran",
        trackList: [
          { uri: "spotify:track:x1", title: "Eraser", subtitle: "Ed Sheeran", duration: 227426, isExplicit: false, audioPreview: { url: "https://p/1" } },
          { uri: "spotify:track:x2", title: "Duet Song", subtitle: "Ed Sheeran, Guest Star", duration: 1000, isExplicit: true },
        ],
        visualIdentity: { image: [{ url: "https://img/album", maxWidth: 640, maxHeight: 640 }] },
      }),
    );
    expect(meta.tracks).toHaveLength(2);
    expect(meta.tracks[0].artist).toBe("Ed Sheeran"); // regression: trackList items have no artists[]
    expect(meta.tracks[0].trackNumber).toBe(1);
    expect(meta.tracks[0].albumName).toBe("÷ (Deluxe)");
    expect(meta.tracks[1].artists.map((a: any) => a.name)).toEqual(["Ed Sheeran", "Guest Star"]);
    expect(meta.tracks[1].coverUrl).toBe("https://img/album"); // inherited from the album
  });

  test("parseEmbedNextData round-trips and rejects garbage", () => {
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(dataOf({ type: "track", id: "z" }))}</script>`;
    expect(parseEmbedNextData(html)?.props.pageProps.state.data.entity.id).toBe("z");
    expect(parseEmbedNextData("<html>no data</html>")).toBeNull();
  });
});
