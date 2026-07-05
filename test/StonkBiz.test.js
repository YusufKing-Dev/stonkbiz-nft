const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("StonkBiz", function () {
  let contract, owner, addr1, addr2;

  beforeEach(async () => {
    [owner, addr1, addr2] = await ethers.getSigners();
    const StonkBiz = await ethers.getContractFactory("StonkBiz");
    contract = await StonkBiz.deploy();
    await contract.waitForDeployment();
  });

  it("should set owner on deploy", async () => {
    expect(await contract.owner()).to.equal(owner.address);
  });

  it("should have correct name, symbol, max supply", async () => {
    expect(await contract.name()).to.equal("StonkBiz");
    expect(await contract.symbol()).to.equal("STONK");
    expect(await contract.MAX_SUPPLY()).to.equal(3444);
  });

  it("should allow public mint when active", async () => {
    await contract.setMintActive(true);
    await contract.connect(addr1).mint(2, { value: ethers.parseEther("0.003") });
    expect(await contract.balanceOf(addr1.address)).to.equal(2);
    expect(await contract.totalSupply()).to.equal(2);
  });

  it("should reject mint when inactive", async () => {
    await expect(
      contract.connect(addr1).mint(1, { value: ethers.parseEther("0.0015") })
    ).to.be.revertedWith("mint not live");
  });

  it("should reject over-limit quantity", async () => {
    await contract.setMintActive(true);
    await expect(
      contract.connect(addr1).mint(11, { value: ethers.parseEther("0.0165") })
    ).to.be.revertedWith("bad qty");
  });

  it("should reject insufficient payment", async () => {
    await contract.setMintActive(true);
    await expect(
      contract.connect(addr1).mint(1, { value: ethers.parseEther("0.001") })
    ).to.be.revertedWith("insufficient ETH");
  });

  it("should allow owner mint", async () => {
    await contract.ownerMint(addr1.address, 5);
    expect(await contract.balanceOf(addr1.address)).to.equal(5);
    expect(await contract.totalSupply()).to.equal(5);
  });

  it("should enforce max supply", async () => {
    await contract.ownerMint(owner.address, 3444);
    await expect(
      contract.ownerMint(owner.address, 1)
    ).to.be.revertedWith("sold out");
  });

  it("should support ERC721 interface", async () => {
    expect(await contract.supportsInterface("0x80ac58cd")).to.be.true;
    expect(await contract.supportsInterface("0x5b5e139f")).to.be.true;
    expect(await contract.supportsInterface("0x01ffc9a7")).to.be.true;
    expect(await contract.supportsInterface("0xffffffff")).to.be.false;
  });

  it("should return correct traits", async () => {
    await contract.ownerMint(owner.address, 1);
    const traits = await contract.getTraits(0);
    expect(traits.background).to.be.a("string");
    expect(traits.body).to.be.a("string");
    expect(traits.accessory).to.be.a("string");
  });

  it("should revert tokenURI for unminted token", async () => {
    await expect(contract.tokenURI(999)).to.be.revertedWith("not minted");
  });

  it("should allow withdrawal by owner", async () => {
    await contract.setMintActive(true);
    await contract.connect(addr1).mint(1, { value: ethers.parseEther("0.0015") });
    const bal = await ethers.provider.getBalance(contract.target);
    expect(bal).to.equal(ethers.parseEther("0.0015"));
    await contract.withdraw();
    expect(await ethers.provider.getBalance(contract.target)).to.equal(0);
  });

  it("should transfer ownership", async () => {
    await contract.transferOwnership(addr1.address);
    expect(await contract.owner()).to.equal(addr1.address);
  });
});
