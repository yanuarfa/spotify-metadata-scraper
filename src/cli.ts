import { enrichTrackWithItunes, scrapeSpotify } from "./scraper.ts";
import { searchDiscovery } from "./search.ts";
import { resolveIsrc } from "./resolve.ts";

const args = process.argv.slice(2);
const enrich = args.includes("--enrich");
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const inputs = args.filter((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));

if (!inputs.length) {
  console.error("Usage: bun run src/cli.ts <spotify url|uri> [more...] [--enrich] [--out file.json]");
  console.error("   or: bun run src/cli.ts search <query...>");
  console.error("   or: bun run src/cli.ts resolve <isrc>");
  process.exit(2);
}

if (inputs[0] === "search") {
  const q = inputs.slice(1).join(" ");
  if (!q) {
    console.error("Usage: bun run src/cli.ts search <query...>");
    process.exit(2);
  }
  console.log(JSON.stringify(await searchDiscovery(q, 10), null, 2));
  process.exit(0);
}

if (inputs[0] === "resolve") {
  const isrc = inputs[1];
  if (!isrc) {
    console.error("Usage: bun run src/cli.ts resolve <isrc>");
    process.exit(2);
  }
  const found = await resolveIsrc(isrc).catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
  if (!found) {
    console.error(`No Spotify track linked to ISRC ${isrc} in MusicBrainz`);
    process.exit(1);
  }
  console.log(JSON.stringify(found, null, 2));
  process.exit(0);
}

const results = [];
for (const input of inputs) {
  let meta = await scrapeSpotify(input);
  if (enrich && meta.type === "track") meta = await enrichTrackWithItunes(meta);
  results.push(meta);
}

const payload = results.length === 1 ? results[0] : results;
const text = JSON.stringify(payload, null, 2);
if (outFile) {
  await Bun.write(outFile, text + "\n");
  console.error(`wrote ${outFile}`);
} else {
  console.log(text);
}
