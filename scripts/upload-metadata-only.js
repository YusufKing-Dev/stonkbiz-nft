/**
 * Uploads metadata to Filebase IPFS using S3-compatible API.
 * Usage: FILEBASE_ACCESS_KEY=x FILEBASE_SECRET_KEY=y node scripts/upload-metadata-only.js
 */

const fs     = require("fs");
const path   = require("path");
const https  = require("https");
const crypto = require("crypto");

const OUTPUT_DIR          = path.resolve(__dirname, "..", "output");
const META_DIR            = path.join(OUTPUT_DIR, "metadata");
const IMAGES_CID          = process.env.IMAGES_CID || "QmSp5c3uNQG2wH42u8yFuMimfcuQpEahw1DDXLPg1nan9e";
const FILEBASE_ACCESS_KEY = process.env.FILEBASE_ACCESS_KEY;
const FILEBASE_SECRET_KEY = process.env.FILEBASE_SECRET_KEY;
const BUCKET              = "stonkbiz-metadata";
const ENDPOINT            = "s3.filebase.com";

if (!FILEBASE_ACCESS_KEY || !FILEBASE_SECRET_KEY) {
  console.error("Missing FILEBASE_ACCESS_KEY or FILEBASE_SECRET_KEY");
  process.exit(1);
}

function hmac(key, data, encoding) {
  return crypto.createHmac("sha256", key).update(data).digest(encoding || "buffer");
}

function sign(key, dateStamp, regionName, serviceName, stringToSign) {
  const kDate    = hmac("AWS4" + key, dateStamp);
  const kRegion  = hmac(kDate, regionName);
  const kService = hmac(kRegion, serviceName);
  const kSigning = hmac(kService, "aws4_request");
  return hmac(kSigning, stringToSign, "hex");
}

function uploadFile(fileContent, fileName) {
  return new Promise((resolve, reject) => {
    const now         = new Date();
    const amzDate     = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z";
    const dateStamp   = amzDate.slice(0, 8);
    const objectKey   = `metadata/${fileName}`;
    const contentType = "application/json";
    const payloadHash = crypto.createHash("sha256").update(fileContent).digest("hex");

    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${ENDPOINT}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;

    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest =
      `PUT\n/${BUCKET}/${objectKey}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

    const algorithm      = "AWS4-HMAC-SHA256";
    const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`;
    const stringToSign   =
      `${algorithm}\n${amzDate}\n${credentialScope}\n` +
      crypto.createHash("sha256").update(canonicalRequest).digest("hex");

    const signature = sign(FILEBASE_SECRET_KEY, dateStamp, "us-east-1", "s3", stringToSign);
    const authorization =
      `${algorithm} Credential=${FILEBASE_ACCESS_KEY}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const options = {
      hostname: ENDPOINT,
      path: `/${BUCKET}/${objectKey}`,
      method: "PUT",
      headers: {
        "Content-Type":          contentType,
        "Content-Length":        fileContent.length,
        "x-amz-date":            amzDate,
        "x-amz-content-sha256":  payloadHash,
        Authorization:           authorization,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        const cid = res.headers["x-amz-meta-cid"] || null;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ ok: true, cid });
        } else {
          console.error(`  Failed ${fileName} (${res.statusCode}): ${data}`);
          resolve({ ok: false });
        }
      });
    });

    req.on("error", reject);
    req.write(fileContent);
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
  console.log(`Updating metadata with image CID: ${IMAGES_CID}`);
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

  for (const f of metaFiles) fs.unlinkSync(path.join(META_DIR, f));
  fs.rmdirSync(META_DIR);
  fs.renameSync(tmpDir, META_DIR);
  console.log(`Updated ${metaFiles.length} metadata files.`);

  // ── Upload to Filebase ─────────────────────────────────────
  console.log("Uploading metadata to Filebase...");
  const files = fs.readdirSync(META_DIR).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  let uploaded = 0;
  let lastCid  = null;

  for (const f of files) {
    const fileContent = fs.readFileSync(path.join(META_DIR, f));
    const result      = await uploadFile(fileContent, f);
    if (result.ok && result.cid) lastCid = result.cid;
    uploaded++;
    if (uploaded % 200 === 0 || uploaded === files.length) {
      console.log(`  ${uploaded}/${files.length} uploaded`);
    }
    await sleep(50);
  }

  // ── Get folder CID from Filebase ───────────────────────────
  console.log("\nFetching folder CID from Filebase...");
  // The CID for the folder is available via the bucket's IPFS CID
  // We'll save what we have and print instructions
  const cidsPath = path.join(OUTPUT_DIR, "cids.json");
  fs.writeFileSync(cidsPath, JSON.stringify({
    imagesCid:   IMAGES_CID,
    metadataCid: lastCid || "CHECK_FILEBASE_DASHBOARD",
  }, null, 2));

  console.log(`\n=== Done! ===`);
  console.log(`Images CID:   ipfs://${IMAGES_CID}`);
  console.log(`Last file CID: ${lastCid}`);
  console.log(`Check Filebase dashboard for the folder CID under your bucket.`);
  console.log(`Base URI for contract: ipfs://<FOLDER_CID>/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
