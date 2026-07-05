# StonkBiz NFT

Gas-optimized NFT collection on Base L2. Built with Hardhat.

## Quick Start

```bash
npm install
npm run compile
npm test
```

## Environment

Copy `.env.example` to `.env` and fill in your values:

```
PRIVATE_KEY=your_deployer_wallet_private_key
BASESCAN_API_KEY=your_basescan_api_key
```

## Deploy

### Local (via CLI)

```bash
# Deploy to Base Sepolia testnet
npm run deploy:sepolia

# Deploy to Base Mainnet
npm run deploy:mainnet
```

### Via GitHub Actions

1. Push this repo to GitHub
2. Add repository secrets:
   - `PRIVATE_KEY` — deployer wallet key (no 0x prefix)
   - `BASESCAN_API_KEY` — from https://basescan.org
3. Go to **Actions > Deploy StonkBiz NFT > Run workflow**
4. Select `baseSepolia` (test) or `baseMainnet` (production)

## Post-Deploy

After deploying, configure the contract:

```bash
# Set base URI for metadata (point to your IPFS/Arweave folder)
npx hardhat console --network baseSepolia
> const c = await ethers.getContractAt("StonkBiz", "YOUR_CONTRACT_ADDRESS");
> await c.setBaseURI("ipfs://YOUR_CID/");
> await c.setMintActive(true);
```

## Allowlist (Merkle Tree)

Generate the merkle root in your deploy script or use:

```js
const { MerkleTree } = require("merkletreejs");
const { keccak256 } = ethers;
const leaves = wallets.map(w => keccak256(w));
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
const root = tree.getHexRoot();
// Call contract.setMerkleRoot(root)
```

## Contract

- **Name:** StonkBiz
- **Symbol:** STONK
- **Max Supply:** 3,444
- **Mint Price:** 0.0015 ETH
- **Max Per TX:** 10
- **Network:** Base L2 (Ethereum L2)
