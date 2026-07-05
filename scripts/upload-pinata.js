/**
 * Uploads the generated collection (images + metadata) to Pinata IPFS.
 * Usage: PINATA_JWT=your_jwt node scripts/upload-pinata.js
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const IMG_DIR    = path.join(OUTPUT_DIR, "images");
const META_DIR   = path.join(OUTPUT_DIR, "metadata");
const PINATA_JWT = process.env.PINATA_JWT;

if (!PINATA_JWT) {
  console.error("Missing PINATA_JWT env var.");
  process.exit(1);
}

function pinataUpload(filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: ${fileName.endsWith(".json") ? "application/json" : "image/png"}\r\n\r\n`,
      "utf-8"
    );
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");
    const totalLength = header.length + fileData.length + footer.length;

    const req = https.request(
      {
        hostname: "api.pinata.cloud",
        path: "/pinning/pinFileToIPFS",
        method: "POST",
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": totalLength,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (!parsed.IpfsHash) {
              console.error(`  Upload failed for ${fileName}:`, data);
            }
            resolve(parsed);
          } catch {
            reject(new Error(data));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(header);
    req.write(fileData);
    req.write(footer);
    req.end();
  });
}

async function uploadFolder(folderPath, label) {
  const files = fs.readdirSync(folderPath).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  console.log(`Uploading ${files.length} files from ${label}...`);

  const batchSize = 10;
  let uploaded = 0;
  let lastCid = null;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((f) => pinataUpload(path.join(folderPath, f), `${label}/${f}`))
    );
    for (const r of results) {
      if (r && r.IpfsHash) lastCid = r.IpfsHash;
    }
    uploaded += batch.length;
    if (uploaded % 100 === 0 || uploaded === files.length) {
      console.log(`  ${uploaded}/${files.length} uploaded`);
    }
  }

  if (!lastCid) {
    throw new Error(`No valid CID returned for ${label}. Check Pinata storage limits or JWT.`);
  }

  return lastCid;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error("No output/ directory found. Run generate script first.");
    process.exit(1);
  }

  // ── Upload images ──────────────────────────────────────────
  console.log("Uploading images to Pinata...");
  const imgCid = await uploadFolder(IMG_DIR, "images");
  console.log(`Images CID: ipfs://${imgCid}`);

  // ── Update metadata with real image CID ───────────────────
  console.log("Updating metadata with image CID...");
  const tmpDir = path.join(OUTPUT_DIR, "_meta_tmp");
  fs.mkdirSync(tmpDir, { recursive: true });

  const metaFiles = fs.readdirSync(META_DIR).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  for (const f of metaFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(META_DIR, f), "utf-8"));
    data.image = `ipfs://${imgCid}/${f.replace(".json", ".png")}`;
    fs.writeFileSync(path.join(tmpDir, f), JSON.stringify(data, null, 2));
  }

  // Replace metadata folder with updated one
  for (const f of metaFiles) {
    fs.unlinkSync(path.join(META_DIR, f));
  }
  fs.rmdirSync(META_DIR);
  fs.renameSync(tmpDir, META_DIR);

  // ── Upload updated metadata ────────────────────────────────
  console.log("Uploading metadata to Pinata...");
  const metaCid = await uploadFolder(META_DIR, "metadata");

  // Save CIDs for deploy script
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "cids.json"),
    JSON.stringify({ imagesCid: imgCid, metadataCid: metaCid }, null, 2)
  );

  console.log(`\n=== Done! ===`);
  console.log(`Images CID:   ipfs://${imgCid}`);
  console.log(`Metadata CID: ipfs://${metaCid}/`);
  console.log(`Base URI for contract: ipfs://${metaCid}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

