name: Deploy StonkBiz NFT

on:
  workflow_dispatch:
    inputs:
      network:
        description: "Target network"
        required: true
        default: "baseSepolia"
        type: choice
        options:
          - baseSepolia
          - baseMainnet

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install
        run: npm install
      - name: Compile
        run: npm run compile
      - name: Deploy
        env:
          PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
          BASESCAN_API_KEY: ${{ secrets.BASESCAN_API_KEY }}
        run: npx hardhat run scripts/deploy.js --network ${{ github.event.inputs.network || 'baseSepolia' }}
