export interface SearchResult {
  source: "deezer" | "itunes";
  id: string;
  name: string;
  artists: string[];
  artist: string;
  albumName: string | null;
  duration: number | null;
  explicit: boolean | null;
  isrc: string | null;
  genre: string | null;
  coverUrl: string | null;
  previewUrl: string | null;
  url: string | null;
  spotifySearchUrl: string;
}

export interface SearchPayload {
  query: string;
  count: number;
  source: "discovery (deezer + itunes)";
  note: string;
  results: SearchResult[];
}

function spotifySearchUrl(name: string, artist: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(`${name} ${artist}`.trim())}`;
}

function base(r: Omit<SearchResult, "spotifySearchUrl">): SearchResult {
  return { ...r, spotifySearchUrl: spotifySearchUrl(r.name, r.artist) };
}

export async function searchDeezer(
  query: string,
  limit: number,
  fetchFn: typeof fetch = fetch,
): Promise<SearchResult[]> {
  const res = await fetchFn(
    `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  return (data?.data ?? []).map((t: any) =>
    base({
      source: "deezer",
      id: String(t.id ?? ""),
      name: t.title ?? "",
      artists: t.artist?.name ? [t.artist.name] : [],
      artist: t.artist?.name ?? "",
      albumName: t.album?.title ?? null,
      duration: typeof t.duration === "number" ? t.duration : null,
      explicit: typeof t.explicit_lyrics === "boolean" ? t.explicit_lyrics : null,
      isrc: t.isrc ?? null,
      genre: null,
      coverUrl: t.album?.cover_xl ?? t.album?.cover_big ?? t.album?.cover_medium ?? null,
      previewUrl: t.preview ?? null,
      url: t.link ?? null,
    }),
  );
}

export async function searchItunes(
  query: string,
  limit: number,
  fetchFn: typeof fetch = fetch,
): Promise<SearchResult[]> {
  const res = await fetchFn(
    `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}&country=US`,
  );
  if (!res.ok) return [];
  const data: any = await res.json().catch(() => null);
  return (data?.results ?? []).map((t: any) => {
    const artist = t.artistName ?? "";
    return base({
      source: "itunes",
      id: String(t.trackId ?? ""),
      name: t.trackName ?? "",
      artists: artist ? [artist] : [],
      artist,
      albumName: t.collectionName ?? null,
      duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : null,
      explicit: t.trackExplicitness ? t.trackExplicitness === "explicit" : null,
      isrc: null,
      genre: t.primaryGenreName ?? null,
      coverUrl: t.artworkUrl100 ? t.artworkUrl100.replace("100x100bb", "600x600bb") : null,
      previewUrl: t.previewUrl ?? null,
      url: t.trackViewUrl ?? null,
    });
  });
}

function dedupeKey(r: SearchResult): string {
  return `${r.name.toLowerCase().trim()}|${r.artist.toLowerCase().trim()}`;
}

export async function searchDiscovery(
  query: string,
  limit = 10,
  fetchFn: typeof fetch = fetch,
): Promise<SearchPayload> {
  const [deezer, itunes] = await Promise.all([
    searchDeezer(query, limit, fetchFn).catch(() => [] as SearchResult[]),
    searchItunes(query, limit, fetchFn).catch(() => [] as SearchResult[]),
  ]);
  const seen = new Set<string>();
  const results: SearchResult[] = [];
  for (const r of [...deezer, ...itunes]) {
    const key = dedupeKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(r);
    if (results.length >= limit) break;
  }
  return {
    query,
    count: results.length,
    source: "discovery (deezer + itunes)",
    note: "Discovery search: results carry Deezer/Apple IDs and ISRC, not Spotify IDs, so they cannot be fed into /api/track/:id. spotifySearchUrl is only a link to Spotify's own search page.",
    results,
  };
}
