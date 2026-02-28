// cv/scripts/fetch-data.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Prefer env var, fallback to the one you already use in the site
const DATA_URL =
  process.env.DATA_URL ||
  "https://script.google.com/macros/s/AKfycbzSE3uE_-l5qVDsj-KmYkuggIxjlPq5vuhzFvZL7RFYbVclHTgLyO5kTIv_sZscXMQLHg/exec";

// Output: repoRoot/data/data.json
const outDir = path.resolve(__dirname, "../../data");
const outFile = path.join(outDir, "data.json");

function assertTabsShape(data) {
  // Minimal sanity checks (adjust if you want)
  const required = ["profile", "career_summary", "impact", "portfolio_categories", "portfolio_projects"];
  const missing = required.filter((k) => !(k in (data || {})));
  if (missing.length) {
    throw new Error(`data.json missing keys: ${missing.join(", ")}`);
  }
}

async function main() {
  console.log("Fetching:", DATA_URL);
  const res = await fetch(DATA_URL, {
    headers: { "Accept": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const data = await res.json();
  assertTabsShape(data);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify(data, null, 2) + "\n", "utf8");

  console.log("Wrote:", outFile);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
