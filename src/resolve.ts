const MB_UA = "spotify-metadata-scraper/0.1 (https://github.com/yanuarfa/spotify-metadata-scraper)";

export interface ResolveResult {
  isrc: string;
  spotifyId: string;
  spotifyUrl: string;
  source: "musicbrainz";
  recordingTitle: string | null;
  recordingArtist: string | null;
}

export function normalizeIsrc(raw: string): string | null {
  const s = raw.replace(/[-\s]/g, "").toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(s) ? s : null;
}

export function spotifyTrackIdFromRelations(relations: any[]): string | null {
  for (const rel of relations ?? []) {
    const resource: string = rel?.url?.resource ?? "";
    const m = resource.match(/^https?:\/\/open\.spotify\.com\/track\/([A-Za-z0-9]+)/);
    if (m) return m[1];
  }
  return null;
}

export function resolveFromMusicbrainz(data: any, isrc: string): ResolveResult | null {
  for (const rec of data?.recordings ?? []) {
    const id = spotifyTrackIdFromRelations(rec?.relations ?? []);
    if (!id) continue;
    const artist =
      (rec["artist-credit"] ?? [])
        .map((c: any) => `${c.name ?? c.artist?.name ?? ""}${c.joinphrase ?? ""}`)
        .join("")
        .trim() || null;
    return {
      isrc,
      spotifyId: id,
      spotifyUrl: `https://open.spotify.com/track/${id}`,
      source: "musicbrainz",
      recordingTitle: rec.title ?? null,
      recordingArtist: artist,
    };
  }
  return null;
}

export async function resolveIsrc(
  rawIsrc: string,
  fetchFn: typeof fetch = fetch,
): Promise<ResolveResult | null> {
  const isrc = normalizeIsrc(rawIsrc);
  if (!isrc) throw new Error(`Invalid ISRC: ${rawIsrc}`);
  const res = await fetchFn(
    `https://musicbrainz.org/ws/2/isrc/${isrc}?fmt=json&inc=artists+releases+url-rels`,
    { headers: { "User-Agent": MB_UA, Accept: "application/json" } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`MusicBrainz lookup failed: HTTP ${res.status} for ISRC ${isrc}`);
  const data: any = await res.json().catch(() => null);
  return data ? resolveFromMusicbrainz(data, isrc) : null;
}
