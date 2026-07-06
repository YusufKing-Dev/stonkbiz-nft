/**
 * Combines all metadata into a single JSON file for GitHub Pages hosting.
 * No external service needed — completely free!
 */

const fs   = require("fs");
const path = require("path");

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const META_DIR   = path.join(OUTPUT_DIR, "metadata");
const PAGES_DIR  = path.resolve(__dirname, "..", "docs");
const IMAGES_CID = process.env.IMAGES_CID || "QmSp5c3uNQG2wH42u8yFuMimfcuQpEahw1DDXLPg1nan9e";

if (!fs.existsSync(META_DIR)) {
  console.error("No output/metadata directory found.");
  process.exit(1);
}

// Create docs folder for GitHub Pages
fs.mkdirSync(PAGES_DIR, { recursive: true });
fs.mkdirSync(path.join(PAGES_DIR, "metadata"), { recursive: true });

console.log(`Using images CID: ipfs://${IMAGES_CID}`);
console.log("Processing metadata files...");

const metaFiles = fs.readdirSync(META_DIR).sort((a, b) => {
  return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
});

let processed = 0;

for (const f of metaFiles) {
  const data = JSON.parse(fs.readFileSync(path.join(META_DIR, f), "utf-8"));
  data.image = `ipfs://${IMAGES_CID}/${f.replace(".json", ".png")}`;

  // Save individual JSON file to docs/metadata/
  fs.writeFileSync(
    path.join(PAGES_DIR, "metadata", f),
    JSON.stringify(data, null, 2)
  );

  processed++;
  if (processed % 500 === 0 || processed === metaFiles.length) {
    console.log(`  ${processed}/${metaFiles.length} processed`);
  }
}

// Create a simple index for verification
const index = {
  total: processed,
  imagesCid: IMAGES_CID,
  baseUrl: "GITHUB_PAGES_URL/metadata/",
};
fs.writeFileSync(path.join(PAGES_DIR, "index.json"), JSON.stringify(index, null, 2));

// Save cids
fs.writeFileSync(
  path.join(OUTPUT_DIR, "cids.json"),
  JSON.stringify({ imagesCid: IMAGES_CID }, null, 2)
);

console.log(`\n=== Done! ===`);
console.log(`Processed: ${processed} metadata files`);
console.log(`Saved to: docs/metadata/`);
console.log(`After workflow, enable GitHub Pages on the docs/ folder`);
console.log(`Base URI will be: https://YOUR_USERNAME.github.io/stonkbiz-nft/metadata/`);
