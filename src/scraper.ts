const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export type SpotifyKind = "track" | "album" | "playlist" | "artist" | "episode" | "show";

export interface ArtistRef {
  name: string;
  id: string | null;
  uri: string | null;
}

export interface TrackMeta {
  type: "track";
  id: string;
  uri: string;
  url: string;
  name: string;
  artists: ArtistRef[];
  artist: string;
  durationMs: number;
  duration: number; // seconds
  releaseDate: string | null;
  year: number | null;
  explicit: boolean;
  isPlayable: boolean | null;
  coverUrl: string | null;
  images: { url: string; width: number | null; height: number | null }[];
  previewUrl: string | null;
  albumName: string | null;
  trackNumber: number | null;
  source: "spotify-embed";
  enrichment?: {
    source: "itunes";
    albumName: string | null;
    trackNumber: number | null;
    discNumber: number | null;
    genre: string | null;
    releaseDate: string | null;
  };
}

export interface CollectionMeta {
  type: "album" | "playlist" | "artist" | "episode" | "show";
  id: string;
  uri: string;
  url: string;
  name: string;
  subtitle: string | null;
  releaseDate: string | null;
  coverUrl: string | null;
  images: { url: string; width: number | null; height: number | null }[];
  tracks: TrackMeta[];
  trackCount: number;
  note?: string;
  source: "spotify-embed";
}

export type SpotifyMeta = TrackMeta | CollectionMeta;

export function parseSpotifyInput(input: string): { kind: SpotifyKind; id: string } {
  const s = input.trim();
  const uri = s.match(/^spotify:(track|album|playlist|artist|episode|show):([A-Za-z0-9]+)$/);
  if (uri) return { kind: uri[1] as SpotifyKind, id: uri[2] };
  const url = s.match(
    /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track|album|playlist|artist|episode|show)\/([A-Za-z0-9]+)/,
  );
  if (url) return { kind: url[1] as SpotifyKind, id: url[2] };
  throw new Error(
    `Unrecognized Spotify input: ${input} — expected an open.spotify.com URL or a spotify:<kind>:<id> URI. ` +
      `Text search is not supported by the no-credentials route.`,
  );
}

export function parseEmbedNextData(html: string): any | null {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch {
    return null;
  }
}

function imagesOf(entity: any): TrackMeta["images"] {
  const raw = entity?.visualIdentity?.image ?? entity?.coverArt?.sources ?? [];
  return raw.map((i: any) => ({
    url: i.url,
    width: i.maxWidth ?? i.width ?? null,
    height: i.maxHeight ?? i.height ?? null,
  }));
}

function largestImage(images: TrackMeta["images"]): string | null {
  if (!images.length) return null;
  return [...images].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url;
}

function idFromUri(uri: string): string {
  return String(uri ?? "").split(":").pop() ?? "";
}

function artistsFromArray(arr: any[]): ArtistRef[] {
  return (arr ?? [])
    .map((a: any) => ({ name: a.name ?? "", id: a.uri ? idFromUri(a.uri) : (a.id ?? null), uri: a.uri ?? null }))
    .filter((a: ArtistRef) => a.name);
}

function artistsFromSubtitle(subtitle: string | null | undefined): ArtistRef[] {
  if (!subtitle) return [];
  return subtitle
    .split(", ")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, id: null, uri: null }));
}

export function trackEntityToMeta(e: any): TrackMeta {
  const artists = artistsFromArray(e.artists ?? []);
  const images = imagesOf(e);
  const release: string | null = e.releaseDate?.isoString ?? null;
  const id = e.id ?? idFromUri(e.uri ?? "");
  return {
    type: "track",
    id,
    uri: e.uri ?? `spotify:track:${id}`,
    url: `https://open.spotify.com/track/${id}`,
    name: e.name ?? e.title ?? "",
    artists,
    artist: artists.map((a) => a.name).join(", "),
    durationMs: e.duration ?? 0,
    duration: Math.round((e.duration ?? 0) / 1000),
    releaseDate: release,
    year: release ? Number(release.slice(0, 4)) : null,
    explicit: Boolean(e.isExplicit),
    isPlayable: typeof e.isPlayable === "boolean" ? e.isPlayable : null,
    coverUrl: largestImage(images),
    images,
    previewUrl: e.audioPreview?.url ?? null,
    albumName: null,
    trackNumber: null,
    source: "spotify-embed",
  };
}

export function trackListItemToMeta(item: any, index: number, parent: any): TrackMeta {
  const artists = artistsFromSubtitle(item.subtitle);
  const images = imagesOf(parent);
  const id = idFromUri(item.uri ?? "");
  return {
    type: "track",
    id,
    uri: item.uri ?? `spotify:track:${id}`,
    url: `https://open.spotify.com/track/${id}`,
    name: item.title ?? item.name ?? "",
    artists,
    artist: artists.map((a) => a.name).join(", "),
    durationMs: item.duration ?? 0,
    duration: Math.round((item.duration ?? 0) / 1000),
    releaseDate: parent?.releaseDate?.isoString ?? null,
    year: parent?.releaseDate?.isoString ? Number(parent.releaseDate.isoString.slice(0, 4)) : null,
    explicit: Boolean(item.isExplicit),
    isPlayable: typeof item.isPlayable === "boolean" ? item.isPlayable : null,
    coverUrl: largestImage(images),
    images,
    previewUrl: item.audioPreview?.url ?? null,
    albumName: parent?.type === "album" ? (parent.name ?? null) : null,
    trackNumber: index + 1,
    source: "spotify-embed",
  };
}

export function embedDataToMeta(data: any): SpotifyMeta {
  const entity = data?.props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("Embed page carried no entity (bad ID, removed content, or Spotify changed the payload).");
  if (entity.type === "track" || entity.type === "episode") return trackEntityToMeta(entity);
  const images = imagesOf(entity);
  const tracks: TrackMeta[] = (entity.trackList ?? []).map((item: any, i: number) =>
    trackListItemToMeta(item, i, entity),
  );
  const out: CollectionMeta = {
    type: entity.type,
    id: entity.id ?? idFromUri(entity.uri ?? ""),
    uri: entity.uri ?? "",
    url: `https://open.spotify.com/${entity.type}/${entity.id ?? idFromUri(entity.uri ?? "")}`,
    name: entity.name ?? entity.title ?? "",
    subtitle: entity.subtitle ?? null,
    releaseDate: entity.releaseDate?.isoString ?? null,
    coverUrl: largestImage(images),
    images,
    tracks,
    trackCount: tracks.length,
    source: "spotify-embed",
  };
  if (entity.type === "playlist" && tracks.length >= 50) {
    out.note = "Embed trackList appears capped at 50 entries by Spotify; longer playlists are truncated here.";
  }
  if (entity.type === "artist") {
    out.note = "Artist embeds carry the top tracks (10 live), not the full discography.";
  }
  return out;
}

export async function scrapeSpotify(
  input: string,
  fetchFn: typeof fetch = fetch,
): Promise<SpotifyMeta> {
  const { kind, id } = parseSpotifyInput(input);
  const res = await fetchFn(`https://open.spotify.com/embed/${kind}/${id}`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Spotify embed fetch failed: HTTP ${res.status} for ${kind}/${id}`);
  const data = parseEmbedNextData(await res.text());
  if (!data) throw new Error(`No __NEXT_DATA__ in the embed page for ${kind}/${id} — Spotify may have changed the page.`);
  return embedDataToMeta(data);
}

export async function enrichTrackWithItunes(
  track: TrackMeta,
  fetchFn: typeof fetch = fetch,
): Promise<TrackMeta> {
  const term = encodeURIComponent(`${track.name} ${track.artists[0]?.name ?? ""}`.trim());
  const res = await fetchFn(`https://itunes.apple.com/search?term=${term}&entity=song&limit=5`);
  if (!res.ok) return track;
  const data: any = await res.json().catch(() => null);
  const hit = (data?.results ?? []).find(
    (r: any) =>
      String(r.trackName ?? "").toLowerCase() === track.name.toLowerCase() &&
      String(r.artistName ?? "").toLowerCase() === (track.artists[0]?.name ?? "").toLowerCase(),
  );
  if (!hit) return track;
  track.enrichment = {
    source: "itunes",
    albumName: hit.collectionName ?? null,
    trackNumber: hit.trackNumber ?? null,
    discNumber: hit.discNumber ?? null,
    genre: hit.primaryGenreName ?? null,
    releaseDate: hit.releaseDate ?? null,
  };
  return track;
}
