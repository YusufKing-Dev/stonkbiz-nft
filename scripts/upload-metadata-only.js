/**
 * Uploads metadata to NFT.Storage using an already-uploaded images CID.
 * Usage: NFT_STORAGE_KEY=your_key IMAGES_CID=QmXxx node scripts/upload-metadata-only.js
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const META_DIR   = path.join(OUTPUT_DIR, "metadata");
const NFT_STORAGE_KEY = process.env.NFT_STORAGE_KEY;
const IMAGES_CID = process.env.IMAGES_CID || "QmSp5c3uNQG2wH42u8yFuMimfcuQpEahw1DDXLPg1nan9e";

if (!NFT_STORAGE_KEY) {
  console.error("Missing NFT_STORAGE_KEY env var.");
  process.exit(1);
}

console.log(`Using images CID: ipfs://${IMAGES_CID}`);

function uploadToNFTStorage(fileData, fileName) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.nft.storage",
      path: "/upload",
      method: "POST",
      headers: {
        Authorization: `Bearer ${NFT_STORAGE_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": fileData.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.ok) {
            console.error(`  Upload failed for ${fileName}:`, data);
          }
          resolve(parsed);
        } catch {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.write(fileData);
    req.end();
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(META_DIR)) {
    console.error("No output/metadata directory found.");
    process.exit(1);
  }

  // ── Update metadata JSONs with real image CID ─────────────
  console.log("Updating metadata with image CID...");
  const tmpDir = path.join(OUTPUT_DIR, "_meta_tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const metaFiles = fs.readdirSync(META_DIR).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  for (const f of metaFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(META_DIR, f), "utf-8"));
    data.image = `ipfs://${IMAGES_CID}/${f.replace(".json", ".png")}`;
    fs.writeFileSync(path.join(tmpDir, f), JSON.stringify(data, null, 2));
  }

  // Swap metadata folder with updated one
  for (const f of metaFiles) {
    fs.unlinkSync(path.join(META_DIR, f));
  }
  fs.rmdirSync(META_DIR);
  fs.renameSync(tmpDir, META_DIR);

  console.log(`Updated ${metaFiles.length} metadata files.`);

  // ── Upload metadata to NFT.Storage one by one ─────────────
  console.log("Uploading metadata to NFT.Storage...");
  const files = fs.readdirSync(META_DIR).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  let uploaded = 0;
  let lastCid = null;

  for (const f of files) {
    const fileData = fs.readFileSync(path.join(META_DIR, f));
    const result = await uploadToNFTStorage(fileData, f);
    if (result && result.value && result.value.cid) {
      lastCid = result.value.cid;
    }
    uploaded++;
    if (uploaded % 100 === 0 || uploaded === files.length) {
      console.log(`  ${uploaded}/${files.length} uploaded`);
    }
    // Small delay to avoid rate limiting
    await sleep(100);
  }

  if (!lastCid) {
    throw new Error("No valid metadata CID returned. Check NFT_STORAGE_KEY.");
  }

  // Save CIDs
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "cids.json"),
    JSON.stringify({ imagesCid: IMAGES_CID, metadataCid: lastCid }, null, 2)
  );

  console.log(`\n=== Done! ===`);
  console.log(`Images CID:            ipfs://${IMAGES_CID}`);
  console.log(`Metadata CID:          ipfs://${lastCid}/`);
  console.log(`Base URI for contract: ipfs://${lastCid}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

