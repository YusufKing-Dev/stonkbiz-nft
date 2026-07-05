/**
 * Uploads metadata JSON files to Cloudinary.
 * Usage: CLOUDINARY_CLOUD_NAME=x CLOUDINARY_API_KEY=y CLOUDINARY_API_SECRET=z node scripts/upload-metadata-only.js
 */

const fs     = require("fs");
const path   = require("path");
const https  = require("https");
const crypto = require("crypto");

const OUTPUT_DIR            = path.resolve(__dirname, "..", "output");
const META_DIR              = path.join(OUTPUT_DIR, "metadata");
const IMAGES_CID            = process.env.IMAGES_CID || "QmSp5c3uNQG2wH42u8yFuMimfcuQpEahw1DDXLPg1nan9e";
const CLOUD_NAME            = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY               = process.env.CLOUDINARY_API_KEY;
const API_SECRET            = process.env.CLOUDINARY_API_SECRET;

if (!CLOUD_NAME || !API_KEY || !API_SECRET) {
  console.error("Missing Cloudinary credentials.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function uploadToCloudinary(fileContent, publicId) {
  return new Promise((resolve, reject) => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder    = "stonkbiz-metadata";

    // Generate signature
    const sigStr   = `folder=${folder}&public_id=${publicId}&resource_type=raw&timestamp=${timestamp}${API_SECRET}`;
    const signature = crypto.createHash("sha256").update(sigStr).digest("hex");

    const boundary  = `----FormBoundary${Math.random().toString(36).slice(2)}`;
    const fileB64   = fileContent.toString("base64");

    // Build multipart body
    const parts = [
      `--${boundary}\r\nContent-Disposition: form-data; name="file"\r\n\r\ndata:application/json;base64,${fileB64}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="public_id"\r\n\r\n${publicId}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="folder"\r\n\r\n${folder}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="resource_type"\r\n\r\nraw`,
      `--${boundary}\r\nContent-Disposition: form-data; name="timestamp"\r\n\r\n${timestamp}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="api_key"\r\n\r\n${API_KEY}`,
      `--${boundary}\r\nContent-Disposition: form-data; name="signature"\r\n\r\n${signature}`,
      `--${boundary}--`,
    ];
    const body = Buffer.from(parts.join("\r\n"), "utf-8");

    const req = https.request(
      {
        hostname: "api.cloudinary.com",
        path: `/v1_1/${CLOUD_NAME}/raw/upload`,
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.secure_url) {
              resolve({ ok: true, url: parsed.secure_url });
            } else {
              console.error(`  Failed ${publicId}:`, data.slice(0, 200));
              resolve({ ok: false });
            }
          } catch {
            reject(new Error(data));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
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
    const data  = JSON.parse(fs.readFileSync(path.join(META_DIR, f), "utf-8"));
    data.image  = `ipfs://${IMAGES_CID}/${f.replace(".json", ".png")}`;
    fs.writeFileSync(path.join(tmpDir, f), JSON.stringify(data, null, 2));
  }

  for (const f of metaFiles) fs.unlinkSync(path.join(META_DIR, f));
  fs.rmdirSync(META_DIR);
  fs.renameSync(tmpDir, META_DIR);
  console.log(`Updated ${metaFiles.length} metadata files.`);

  // ── Upload to Cloudinary ───────────────────────────────────
  console.log("Uploading metadata to Cloudinary...");
  const files = fs.readdirSync(META_DIR).sort((a, b) => {
    return parseInt(a.split(".")[0]) - parseInt(b.split(".")[0]);
  });

  let uploaded  = 0;
  let failed    = 0;
  let baseUrl   = null;

  for (const f of files) {
    const fileContent = fs.readFileSync(path.join(META_DIR, f));
    const publicId    = f.replace(".json", "");
    const result      = await uploadToCloudinary(fileContent, publicId);

    if (result.ok) {
      uploaded++;
      if (!baseUrl) {
        // Derive base URL from first successful upload
        baseUrl = result.url.replace(`/${publicId}`, "").replace(/\/[^/]+$/, "");
      }
    } else {
      failed++;
    }

    if ((uploaded + failed) % 200 === 0 || (uploaded + failed) === files.length) {
      console.log(`  ${uploaded + failed}/${files.length} processed (${failed} failed)`);
    }

    await sleep(100);
  }

  // Save results
  const cloudBaseUrl = `https://res.cloudinary.com/${CLOUD_NAME}/raw/upload/stonkbiz-metadata/`;
  fs.writeFileSync(
    path.join(OUTPUT_DIR, "cids.json"),
    JSON.stringify({
      imagesCid: IMAGES_CID,
      metadataBaseUrl: cloudBaseUrl,
    }, null, 2)
  );

  console.log(`\n=== Done! ===`);
  console.log(`Uploaded: ${uploaded}, Failed: ${failed}`);
  console.log(`Images CID:      ipfs://${IMAGES_CID}`);
  console.log(`Metadata Base URL: ${cloudBaseUrl}`);
  console.log(`Base URI for contract: ${cloudBaseUrl}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
