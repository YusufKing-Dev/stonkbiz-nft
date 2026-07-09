/**
 * Generates 3,444 NFT images + metadata matching the StonkBiz contract's
 * deterministic trait logic.
 *
 * Usage:
 *   node scripts/generate-collection.js [path-to-base-image]
 *
 * If no path is given, looks for base.png / base.jpg / base.jpeg in docs/.
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const { keccak256, solidityPacked } = require("ethers");

// ------ CONFIGURABLE ------
const IMG_SIZE = 1536;
const OUTPUT_DIR = path.resolve(__dirname, "..", "docs");
const MAX_SUPPLY = 3444;

// Adjust these if accessories don't align with your character
const POSITIONS = {
  glasses: { x: 0.5, y: 0.40, scale: 0.38 },   // over the eyes
  chain:   { x: 0.5, y: 0.55, scale: 0.30 },   // neck area
  crown:   { x: 0.5, y: 0.10, scale: 0.25 },   // top of head
};
// ------ END CONFIG ------

// Background colors (matching contract trait indices)
const BG_COLORS = [
  "#b0b0b0", // Grey
  "#4A90D9", // Blue
  "#4CAF50", // Green
  "#FFD700", // Gold
  "#E53935", // Red
  "#9C27B0", // Rainbow
];

// ------ TRAIT LOGIC (exact replica of the contract) ------
const BG_WEIGHTS = [35, 25, 15, 12, 8, 5];
const BODY_WEIGHTS = [40, 25, 18, 12, 5];
const ACC_WEIGHTS = [45, 25, 15, 10, 5];

const BG_NAMES = ["Grey", "Blue", "Green", "Gold", "Red", "Rainbow"];
const BODY_NAMES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
const ACC_NAMES = ["None", "Tie", "Glasses", "Chain", "Crown"];

function seed(tokenId, salt) {
  const hash = keccak256(
    solidityPacked(["uint256", "string", "string"], [BigInt(tokenId), salt, "STONKBIZ-3444"])
  );
  return BigInt(hash);
}

function weightedIndex(rand, weights) {
  const r = Number(rand % 100n);
  let cum = 0;
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i];
    if (r < cum) return i;
  }
  return weights.length - 1;
}

function getTraitIndices(tokenId) {
  const s = seed(tokenId, "BG");
  const background = weightedIndex(s, BG_WEIGHTS);
  const body = weightedIndex(seed(tokenId, "BODY"), BODY_WEIGHTS);
  const accessory = weightedIndex(seed(tokenId, "ACC"), ACC_WEIGHTS);
  return { background, body, accessory };
}

// ------ SVG ACCESSORY GENERATORS ------
function svgGlasses(w, h) {
  const lensR = w * 0.10;
  const bridgeW = w * 0.14;
  const centerY = h * 0.5;
  const leftX = w * 0.5 - lensR - bridgeW / 2;
  const rightX = w * 0.5 + bridgeW / 2;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${leftX}" cy="${centerY}" r="${lensR}" fill="none" stroke="#222" stroke-width="6"/>
    <circle cx="${rightX}" cy="${centerY}" r="${lensR}" fill="none" stroke="#222" stroke-width="6"/>
    <line x1="${leftX}" y1="${centerY}" x2="${rightX}" y2="${centerY}" stroke="#222" stroke-width="6"/>
    <line x1="${leftX - lensR - 10}" y1="${centerY - 10}" x2="${leftX - lensR}" y2="${centerY}" stroke="#222" stroke-width="6"/>
    <line x1="${rightX + lensR + 10}" y1="${centerY - 10}" x2="${rightX + lensR}" y2="${centerY}" stroke="#222" stroke-width="6"/>
    <!-- lens tint -->
    <circle cx="${leftX}" cy="${centerY}" r="${lensR * 0.9}" fill="rgba(100,150,255,0.15)"/>
    <circle cx="${rightX}" cy="${centerY}" r="${lensR * 0.9}" fill="rgba(100,150,255,0.15)"/>
  </svg>`;
}

function svgChain(w, h) {
  const cx = w * 0.5;
  const startY = h * 0.35;
  const endY = h * 0.7;
  const segs = 12;
  let circles = "";
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = startY + (endY - startY) * t;
    const sway = Math.sin(t * Math.PI) * w * 0.06;
    const r = 4 + t * 3;
    circles += `<circle cx="${cx + sway}" cy="${y}" r="${r}" fill="none" stroke="#C0A060" stroke-width="2.5"/>`;
  }
  // pendant
  circles += `<circle cx="${cx}" cy="${endY + 20}" r="18" fill="#C0A060" stroke="#A08040" stroke-width="3"/>`;
  circles += `<circle cx="${cx}" cy="${endY + 20}" r="8" fill="#FFD700"/>`;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${circles}</svg>`;
}

function svgCrown(w, h) {
  const cy = h * 0.15;
  const cw = w * 0.45;
  const left = w * 0.5 - cw / 2;
  const spikeH = h * 0.1;
  const baseY = cy + spikeH;
  const pts = [
    `${left},${baseY}`,
    `${left},${cy}`,
    `${left + cw * 0.2},${baseY}`,
    `${left + cw * 0.35},${cy - spikeH * 0.5}`,
    `${left + cw * 0.5},${baseY}`,
    `${left + cw * 0.65},${cy - spikeH * 0.5}`,
    `${left + cw * 0.8},${baseY}`,
    `${left + cw},${cy}`,
    `${left + cw},${baseY}`,
  ];
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <polygon points="${pts.join(" ")}" fill="#FFD700" stroke="#C8A000" stroke-width="4"/>
    <rect x="${left}" y="${baseY - 2}" width="${cw}" height="${h * 0.04}" fill="#FFD700" stroke="#C8A000" stroke-width="2"/>
    <circle cx="${w * 0.5}" cy="${cy + spikeH * 0.3}" r="8" fill="#E53935"/>
    <circle cx="${left + cw * 0.25}" cy="${baseY - 4}" r="5" fill="#4A90D9"/>
    <circle cx="${left + cw * 0.75}" cy="${baseY - 4}" r="5" fill="#4A90D9"/>
  </svg>`;
}

// ------ MAIN ------
async function main() {
  let basePath;
  const baseArg = process.argv[2];
  if (baseArg) {
    basePath = path.resolve(baseArg);
  } else {
    // Auto-detect base image in docs folder (GitHub Pages root)
    const candidates = ["base.png", "base.jpg", "base.jpeg"];
    for (const c of candidates) {
      const p = path.resolve(__dirname, "..", "docs", c);
      if (fs.existsSync(p)) { basePath = p; break; }
    }
  }
  if (!basePath || !fs.existsSync(basePath)) {
    console.error("Base image not found. Place base.png (or .jpg) in docs/.");
    process.exit(1);
  }

  // Create output dirs
  const imgDir = path.join(OUTPUT_DIR, "images");
  const metaDir = path.join(OUTPUT_DIR, "metadata");
  fs.mkdirSync(imgDir, { recursive: true });
  fs.mkdirSync(metaDir, { recursive: true });

  const baseBuffer = await sharp(fs.readFileSync(basePath))
    .resize(IMG_SIZE, IMG_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  console.log(`Generating ${MAX_SUPPLY} tokens...`);

  for (let tokenId = 0; tokenId < MAX_SUPPLY; tokenId++) {
    const traits = getTraitIndices(tokenId);
    const bgName = BG_NAMES[traits.background];
    const bodyName = BODY_NAMES[traits.body];
    const accName = ACC_NAMES[traits.accessory];

    // Build image
    let layers = [];

    // 1) Base image
    layers.push({
      input: baseBuffer,
      top: 0,
      left: 0,
    });

    // 2) Accessory overlay
    if (traits.accessory === 2) {
      // Glasses
      const pos = POSITIONS.glasses;
      const size = IMG_SIZE * pos.scale;
      layers.push({
        input: Buffer.from(svgGlasses(size, size)),
        top: Math.round(IMG_SIZE * pos.y - size / 2),
        left: Math.round(IMG_SIZE * pos.x - size / 2),
      });
    } else if (traits.accessory === 3) {
      // Chain
      const pos = POSITIONS.chain;
      const size = IMG_SIZE * pos.scale;
      layers.push({
        input: Buffer.from(svgChain(size, size * 1.5)),
        top: Math.round(IMG_SIZE * pos.y - size * 0.5),
        left: Math.round(IMG_SIZE * pos.x - size / 2),
      });
    } else if (traits.accessory === 4) {
      // Crown
      const pos = POSITIONS.crown;
      const size = IMG_SIZE * pos.scale;
      layers.push({
        input: Buffer.from(svgCrown(size, size * 0.8)),
        top: Math.round(IMG_SIZE * pos.y),
        left: Math.round(IMG_SIZE * pos.x - size / 2),
      });
    }
    // Accessory 0 (None) and 1 (Tie) — no overlay (tie is part of base art)

    // Composite and save (background color fills canvas, then base + accessory on top)
    const bgColor = BG_COLORS[traits.background];
    const imgPath = path.join(imgDir, `${tokenId}.png`);
    await sharp({ create: { width: IMG_SIZE, height: IMG_SIZE, channels: 4, background: bgColor } })
      .composite(layers)
      .png()
      .toFile(imgPath);

    // Metadata
    const metadata = {
      name: `StonkBiz #${tokenId}`,
      description: "StonkBiz — Base L2 NFT Collection",
      image: `https://yusufking-dev.github.io/stonkbiz-nft/images/${tokenId}.png`,
      attributes: [
        { trait_type: "Background", value: bgName },
        { trait_type: "Body", value: bodyName },
        { trait_type: "Accessory", value: accName },
      ],
    };
    fs.writeFileSync(path.join(metaDir, `${tokenId}.json`), JSON.stringify(metadata, null, 2));

    if (tokenId % 100 === 0) {
      console.log(`  ${tokenId}/${MAX_SUPPLY} — BG:${bgName} Body:${bodyName} Acc:${accName}`);
    }
  }

  console.log(`\nDone! Generated ${MAX_SUPPLY} images + metadata.`);
  console.log(`  Images:   ${path.join(OUTPUT_DIR, "images")}`);
  console.log(`  Metadata: ${path.join(OUTPUT_DIR, "metadata")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
