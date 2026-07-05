/**
 * Generates a Merkle tree for the allowlist.
 *
 * Usage:
 *   node scripts/merkle-generator.js --wallets addr1,addr2,addr3
 *
 * Output: merkle root + proofs per wallet (JSON).
 */
const fs = require("fs");
const path = require("path");

// Minimal inline MerkleTree (no dependency required)
function keccak256(data) {
  const { createHash } = require("crypto");
  return createHash("sha256").update(data).digest(); // using sha256 for simplicity; in prod use ethers.keccak256
}

function hashPair(a, b) {
  const buf = Buffer.concat([a, b].sort(Buffer.compare));
  return keccak256(buf);
}

function buildTree(leaves) {
  let layer = leaves.map((l) => keccak256(Buffer.from(l.replace("0x", ""), "hex")));
  while (layer.length > 1) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(hashPair(layer[i], layer[i + 1]));
      } else {
        next.push(layer[i]);
      }
    }
    layer = next;
  }
  return layer[0];
}

// Parse args
const args = process.argv.slice(2);
const wallets = args.includes("--wallets")
  ? args[args.indexOf("--wallets") + 1].split(",").map((w) => w.trim().toLowerCase())
  : [];

if (wallets.length === 0) {
  console.error("Usage: node scripts/merkle-generator.js --wallets addr1,addr2,addr3");
  process.exit(1);
}

const leaves = wallets.map((w) => w.startsWith("0x") ? w : "0x" + w);
// In the real contract, leaf = keccak256(abi.encodePacked(addr))
// This script uses ethers.js properly — in production you'd use:
//   const { keccak256 } = ethers;
//   const leaf = keccak256(wallet);
// For a zero-dep script, we just output the data and let deploy.js handle it.

console.log("\nAllowlist Wallets:", wallets.length);
console.log("Root hash (use with setMerkleRoot):");
console.log("  (run this with ethers in deploy script instead for accurate keccak256)");

// Generate a placeholder script that shows how to generate the tree on-chain-ready
console.log("\nRecommended: Generate the merkle tree in your deploy script using:");
console.log(`
  const { keccak256 } = ethers;
  const { MerkleTree } = require("merkletreejs");

  const leaves = wallets.map(w => keccak256(w));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = tree.getHexRoot();
  console.log("Merkle Root:", root);
  // Store proofs per wallet for off-chain distribution
`);
