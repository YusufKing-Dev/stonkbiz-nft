const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const StonkBiz = await hre.ethers.getContractFactory("StonkBiz");
  const contract = await StonkBiz.deploy();

  await contract.waitForDeployment();
  const addr = await contract.getAddress();

  console.log("StonkBiz deployed to:", addr);

  // Wait for confirmations before verification
  if (hre.network.name !== "hardhat") {
    console.log("Waiting for block confirmations...");
    await contract.deploymentTransaction().wait(5);
    console.log("Confirmations received");

    // Attempt source verification
    try {
      await hre.run("verify:verify", { address: addr });
      console.log("Contract verified on Basescan");
    } catch (e) {
      console.log("Verification failed (can be done manually later):", e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
