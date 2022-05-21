import hre from "hardhat";
const { ethers } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("🚩 Testing: 🥩 Whitelist", async function () {
  this.timeout(45000);

  let msgSender: any;
  let coinContract: any;
  let whitelistContract: any;

  it("Should set env vars", async function () {
    const [owner] = await ethers.getSigners();
    msgSender = owner.address;
  });
  it("Should deploy Whitelist", async function () {
    const whiteList = await ethers.getContractFactory("WhiteList");
    whitelistContract = await whiteList.deploy(msgSender);
    console.log("Whitelist contract: ", whitelistContract.address);
  });
  it("Should deploy ERC20Coin", async function () {
    const Coin = await ethers.getContractFactory("ERC20Coin");
    coinContract = await Coin.deploy(
      "iSURE",
      "SAFE",
      ethers.utils.parseEther("1000000"),
      msgSender
    );
    console.log("Coin contract: ", coinContract.address);
  });

  it("Should add tokens to whitelist", async function () {
    console.log("\t", " ⏳ Whitelisting coin contract...");
    const wlResult = await whitelistContract.listToken(
      "iSHURE",
      "SAFE",
      coinContract.address
    );
    console.log(
      "\t",
      " ⏳ Waiting for confirmation from listToken function..."
    );
    const txResult = await wlResult.wait();
    expect(txResult.status).to.equal(1);
  });
  it("Should add another token to whitelist", async function () {
    const Coin = await ethers.getContractFactory("ERC20Coin");
    const newContract = await Coin.deploy(
      "Alchemy",
      "ALCH",
      ethers.utils.parseEther("1000000"),
      msgSender
    );
    console.log("\t", "Alchemy Coin contract: ", newContract.address);
    console.log("\t", " ⏳ Whitelisting Alchemy coin contract...");
    const wlResult = await whitelistContract.listToken(
      "Alchemy",
      "ALCH",
      newContract.address
    );
    console.log(
      "\t",
      " ⏳ Waiting for confirmation from listToken function..."
    );
    const txResult = await wlResult.wait();
    expect(txResult.status).to.equal(1);
  });
  it("Should add another token to whitelist", async function () {
    const Coin = await ethers.getContractFactory("ERC20Coin");
    const newContract = await Coin.deploy(
      "Balancer",
      "BAL",
      ethers.utils.parseEther("1000000"),
      msgSender
    );
    console.log("\t", "Balancer Coin contract: ", newContract.address);
    console.log("\t", " ⏳ Whitelisting coin contract...");
    const wlResult = await whitelistContract.listToken(
      "Balancer",
      "BAL",
      newContract.address
    );
    console.log(
      "\t",
      " ⏳ Waiting for confirmation from listToken function..."
    );
    const txResult = await wlResult.wait();
    expect(txResult.status).to.equal(1);
  });

  it("Should retrieve token listing from contract", async function () {
    console.log("\t", " ⏳ Retrieving token listings...");
    const txResult = await whitelistContract.getListings();
    console.log(
      "\t",
      " ⏳ Waiting for confirmation from getListings function..."
    );

    //   console.log(txResult);
    expect(txResult.length).to.equal(3);
  });
  it("Should delete token from contract", async function () {
    console.log("\t", " ⏳ Deleting token listing...");
    const rtResult = await whitelistContract.removeToken(coinContract.address);
    console.log(
      "\t",
      " ⏳ Waiting for confirmation from removeToken function..."
    );
    const txResult = await rtResult.wait();
    expect(txResult.status).to.equal(1);
    console.log("\t", " ⏳ Retrieving token listings...");
    const glResult = await whitelistContract.getListings();
    console.log(
      "\t",
      " ⏳ Waiting for confirmation from getListings function..."
    );

    // console.log(glResult);
    expect(glResult.length).to.equal(2);
    await hre.network.provider.send("hardhat_reset");
  });
});
