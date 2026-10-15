import { enrichTrackWithItunes, scrapeSpotify } from "./scraper.ts";

const args = process.argv.slice(2);
const enrich = args.includes("--enrich");
const outIdx = args.indexOf("--out");
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;
const inputs = args.filter((a, i) => !a.startsWith("--") && (outIdx < 0 || i !== outIdx + 1));

if (!inputs.length) {
  console.error("Usage: bun run src/cli.ts <spotify url|uri> [more...] [--enrich] [--out file.json]");
  process.exit(2);
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
