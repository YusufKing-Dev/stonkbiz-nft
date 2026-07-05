/**
 * Uploads the generated collection (images + metadata) to Pinata IPFS.
 *
 * Usage:
 *   PINATA_JWT=your_jwt node scripts/upload-pinata.js
 *
 * Get your JWT from: https://app.pinata.cloud/developers/api-keys
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const { Readable } = require("stream");

const OUTPUT_DIR = path.resolve(__dirname, "..", "output");
const IMG_DIR = path.join(OUTPUT_DIR, "images");
const META_DIR = path.join(OUTPUT_DIR, "metadata");
const PINATA_JWT = process.env.PINATA_JWT;

if (!PINATA_JWT) {
  console.error("Missing PINATA_JWT env var. Get one at https://app.pinata.cloud/developers/api-keys");
  process.exit(1);
}

function pinataUpload(filePath, fileName) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = `----FormBoundary${Math.random().toString(36).slice(2)}`;

    let body = "";
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`;
    body += `Content-Type: ${fileName.endsWith(".json") ? "application/json" : "image/png"}\r\n\r\n`;

    const bodyBuffer = Buffer.from(body, "utf-8");
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf-8");

    const req = https.request(
      {
        hostname: "api.pinata.cloud",
        path: "/pinning/pinFileToIPFS",
        method: "POST",
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": bodyBuffer.length + fileData.length + footer.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(data));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(bodyBuffer);
    req.write(fileData);
    req.write(footer);
    req.end();
  });
}

async function uploadFolder(folderPath, label) {
  const files = fs.readdirSync(folderPath).sort((a, b) => {
    const na = parseInt(a.split(".")[0]);
    const nb = parseInt(b.split(".")[0]);
    return na - nb;
  });

  console.log(`Uploading ${files.length} files from ${label}...`);

  // Upload in batches of 10 to avoid rate limits
  const batchSize = 10;
  let uploaded = 0;
  let cid = null;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((f) => pinataUpload(path.join(folderPath, f), `${label}/${f}`))
    );
    for (const r of results) {
      if (r.IpfsHash) cid = r.IpfsHash;
    }
    uploaded += batch.length;
    if (uploaded % 100 === 0 || uploaded === files.length) {
      console.log(`  ${uploaded}/${files.length} uploaded`);
    }
  }

  return cid;
}

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error("No output/ directory found. Run 'npm run generate' first.");
    process.exit(1);
  }

  console.log("Uploading images to Pinata...");
  const imgCid = await uploadFolder(IMG_DIR, "images");
  console.log(`Images CID: ipfs://${imgCid}`);

  // Update metadata JSONs with the real CID
  console.log("Updating metadata with image CID...");
  const metaFiles = fs.readdirSync(META_DIR).sort((a, b) => {
    const na = parseInt(a.split(".")[0]);
    const nb = parseInt(b.split(".")[0]);
    return na - nb;
  });

  const tmpDir = path.join(OUTPUT_DIR, "_meta_tmp");
fs.mkdirSync(tmpDir, { recursive: true });

  for (const f of metaFiles) {
    const data = JSON.parse(fs.readFileSync(path.join(META_DIR, f), "utf-8"));
    data.image = `ipfs://${imgCid}/${f.replace(".json", ".png")}`;
    fs.writeFileSync(path.join(tmpDir, f), JSON.stringify(data));
  }

  // Replace with updated metadata
  for (const f of metaFiles) {
    fs.unlinkSync(path.join(META_DIR, f));
  }
  fs.rmdirSync(META_DIR);
  fs.renameSync(tmpDir, META_DIR);

  console.log("Uploading metadata to Pinata...");
  const metaCid = await uploadFolder(META_DIR, "metadata");

  // Save CID so deploy script can read it
  fs.writeFileSync(path.join(OUTPUT_DIR, "metadata-cid.txt"), metaCid);

  console.log(`\n=== Done! ===`);
  console.log(`Images CID: ipfs://${imgCid}`);
  console.log(`Metadata CID: ipfs://${metaCid}/`);
  console.log(`Base URI for contract: ipfs://${metaCid}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
