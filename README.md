# spotify-metadata-scraper

Spotify metadata scraper menggunakan bun dan wrangler, dibuat agar bisa berjalan diatas cloudflare worker.



## Pakai

```bash
bun run src/cli.ts https://open.spotify.com/track/7qiZfU4dY1lWllzX7mPBI3
bun run src/cli.ts spotify:album:3T4tUhGYeRNVUGevb0wThu
bun run src/cli.ts <url-playlist> <url-artist>
bun run src/cli.ts <url-track> --enrich
bun run src/cli.ts <url> --out hasil.json
bun run src/cli.ts search ariana grande into you
bun test
```

Sebagai library: `import { scrapeSpotify } from "./src/scraper.ts"`.

## Sebagai API di Cloudflare Workers


```bash
bun install
bun run dev
bun run deploy
```

Endpoint (semua JSON, CORS terbuka, error juga JSON `{ "error": "..." }`):

```text
GET  /
GET  /health
GET  /api/scrape?url=<url-atau-uri-spotify>[&enrich=1]
GET  /api/track/<id>     /api/album/<id>     /api/playlist/<id>
GET  /api/artist/<id>    /api/episode/<id>   /api/show/<id>     [&enrich=1]
POST /api/scrape         { "url": "..." }  atau  { "urls": ["...", "..."] }  (maks 10)
GET  /api/search?q=<query>[&limit=10]     discovery Deezer + iTunes (bukan ID Spotify)
```