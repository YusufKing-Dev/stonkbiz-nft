/**
 * Uploads ONLY metadata to Pinata using an already-uploaded images CID.
 * Run this when images are already on IPFS.
 * 
 * Usage: PINATA_JWT=your_jwt IMAGES_CID=QmXxx node scripts/upload-metadata-only.js
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const META_DIR   = path.join(OUTPUT_DIR, "metadata");
const PINATA_JWT = process.env.PINATA_JWT;
const IMAGES_CID = process.env.IMAGES_CID || "QmSp5c3uNQG2wH42u8yFuMimfcuQpEahw1DDXLPg1nan9e";

if (!PINATA_JWT) {
  console.error("Missing PINATA_JWT env var.");
  process.exit(1);
}

console.log(`Using images CID: ipfs://${IMAGES_CID}`);

function pinataUpload(filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;

    const header = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n` +
      `Content-Type: application/json\r\n\r\n`,
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

  // ── Upload metadata to Pinata ─────────────────────────────
  console.log("Uploading metadata to Pinata...");
  const files = fs.readdirSync(META_DIR).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  const batchSize = 10;
  let uploaded = 0;
  let lastCid = null;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((f) => pinataUpload(path.join(META_DIR, f), `metadata/${f}`))
    );
    for (const r of results) {
      if (r && r.IpfsHash) lastCid = r.IpfsHash;
    }
    uploaded += batch.length;
    if (uploaded % 200 === 0 || uploaded === files.length) {
      console.log(`  ${uploaded}/${files.length} uploaded`);
    }
  }

  if (!lastCid) {
    throw new Error("No valid metadata CID returned. Check Pinata storage limits or JWT.");
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
