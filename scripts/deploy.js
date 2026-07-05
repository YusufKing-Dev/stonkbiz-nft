const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const networkName = hre.network.name;
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Network:", networkName);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  const StonkBiz = await hre.ethers.getContractFactory("StonkBiz");
  const contract = await StonkBiz.deploy();
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log("Contract deployed to:", addr);

  // Try to read baseURI from generated output
  const outputDir = path.resolve(__dirname, "..", "output");
  const cidFile = path.join(outputDir, "metadata-cid.txt");
  if (fs.existsSync(cidFile)) {
    const cid = fs.readFileSync(cidFile, "utf-8").trim();
    const baseURI = `ipfs://${cid}/`;
    await contract.setBaseURI(baseURI);
    console.log("Base URI set:", baseURI);
  }

  await contract.setMintActive(true);
  console.log("Minting enabled");

  // Verification
  if (networkName !== "hardhat") {
    console.log("Waiting for confirmations...");
    await contract.deploymentTransaction().wait(5);

    const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY;
    if (BASESCAN_API_KEY) {
      try {
        await hre.run("verify:verify", { address: addr });
        console.log("Verified on Basescan");
      } catch (e) {
        if (!e.message.includes("already verified")) {
          console.log("Verification note:", e.message);
        }
      }
    }
  }

  console.log("\n=== DEPLOY SUMMARY ===");
  console.log("Contract:", addr);
  console.log("Network:", networkName);
  console.log("Explorer:", networkName === "baseSepolia"
    ? `https://sepolia.basescan.org/address/${addr}`
    : `https://basescan.org/address/${addr}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
