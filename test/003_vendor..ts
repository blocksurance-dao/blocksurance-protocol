import hre from "hardhat";
const { ethers } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("🚩 Testing: 🥩  Vendor!", function () {
  this.timeout(45000);

  let msgSender: any;
  let coinContract: any;
  let vendorContract: any;
  let registarContract: any;
  const tokensPerEth = 40000;

  it("Should set env vars", async function () {
    await hre.network.provider.send("hardhat_reset");
    const [owner] = await ethers.getSigners();
    msgSender = owner.address;
  });
  it("Should deploy Registar", async function () {
    const registar = await ethers.getContractFactory("Registar");
    registarContract = await registar.deploy(msgSender);
    console.log("Registar contract: ", registarContract.address);
  });

  it("Should deploy ERC20Coin", async function () {
    const Coin = await ethers.getContractFactory("ERC20Coin");
    coinContract = await Coin.deploy(
      "BLOCKSURANCE",
      "4SURE",
      500000000,
      msgSender
    );
  });
  it("Should deploy Vendor", async function () {
    const vendor = await ethers.getContractFactory("Vendor");
    vendorContract = await vendor.deploy(
      coinContract.address,
      registarContract.address,
      msgSender
    );
  });

  describe("Coin", function () {
    it("You should be able to mint tokens()", async function () {
      console.log("\t", " ⏳ Minting 500 tokens...");
      const oneBalance = await coinContract.balanceOf(vendorContract.address);
      const mintResult = await coinContract.mint(
        vendorContract.address,
        ethers.utils.parseEther("250000000")
      );
      console.log("\t", " ⏳ Waiting for confirmation from mint function...");
      const txResult = await mintResult.wait();
      expect(txResult.status).to.equal(1);
      const twoBalance = await coinContract.balanceOf(vendorContract.address);
      expect(twoBalance).to.equal(
        oneBalance.add(ethers.utils.parseEther("250000000")) // 250M
      );
      const supply = await vendorContract.checkSupply();
      expect(ethers.utils.formatEther(supply)).to.equal(
        ethers.utils.formatEther(twoBalance)
      );
    });
    it("should fail if you try to mint an amount greater than the hard cap", async () => {
      await expect(
        coinContract.mint(
          vendorContract.address,
          ethers.utils.parseEther("500000001") // 500M
        )
      ).to.be.revertedWith("Not enough tokens left!");
    });
    it("You should be able to airdrop tokens()", async function () {
      console.log("\t", " ⏳ Airdropping some tokens...");
      const [owner, acc1] = await ethers.getSigners();
      const airResult = await coinContract.airdrop(
        [owner.address, acc1.address, vendorContract.address],
        ethers.utils.parseEther("50")
      );
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from airdrop function..."
      );
      const txResult = await airResult.wait();
      expect(txResult.status).to.equal(1);
    });
  });

  describe("Vendor", function () {
    // ################**VENDOR**################ //

    it("Should be able to set minimalBuy variable", async () => {
      await vendorContract.setMinBuy(ethers.utils.parseEther("4000000"));
      expect(await vendorContract.getMinBuy()).to.equal(
        ethers.utils.parseEther("4000000") // 4M
      );
      await vendorContract.setMinBuy(ethers.utils.parseEther("5000000"));
      expect(await vendorContract.getMinBuy()).to.equal(
        ethers.utils.parseEther("5000000") // 5M
      );
      await vendorContract.setMinBuy(ethers.utils.parseEther("20000"));
      expect(await vendorContract.getMinBuy()).to.equal(
        ethers.utils.parseEther("20000") // 4M
      );
    });

    it("Should be able to set tokensPerEth variable", async () => {
      expect(await vendorContract.getPrice()).to.equal(tokensPerEth);
      await vendorContract.setPrice(50000);
      expect(await vendorContract.getPrice()).to.equal(50000);
      await vendorContract.setPrice(tokensPerEth);
      expect(await vendorContract.getPrice()).to.equal(tokensPerEth);
    });

    it("Balance should go up when you buyTokens()", async function () {
      console.log("\t", " 🧑‍🏫 Tester Address: ", msgSender);

      const startingBalance = await coinContract.balanceOf(msgSender);
      console.log(
        "\t",
        " ⚖️ Starting balance: ",
        ethers.utils.formatEther(startingBalance)
      );

      console.log("\t", " 🔨 Buying...");
      const buyResult = await vendorContract.buyTokens({
        value: ethers.utils.parseEther("80"),
      });
      console.log("\t", " 🏷  buyResult: ", buyResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await buyResult.wait();
      expect(txResult.status).to.equal(1);

      const newBalance = await coinContract.balanceOf(msgSender);
      console.log(
        "\t",
        " 🔎 New balance: ",
        ethers.utils.formatEther(newBalance)
      );

      expect(newBalance).to.equal(
        startingBalance.add(
          ethers.utils.parseEther((80 * tokensPerEth).toString())
        )
      );

      const vendorBalance = await coinContract.balanceOf(
        vendorContract.address
      );

      console.log(
        "\t",
        "Contract balance: ",
        ethers.utils.formatEther(vendorBalance)
      );
    });

    it("BuyTokens should fail after it is paused", async function () {
      console.log("\t", " 🔨 Pause Staking...");
      await vendorContract.setPaused(true);

      await expect(
        vendorContract.buyTokens({
          value: ethers.utils.parseEther("80"),
        })
      ).to.be.revertedWith("Sales temporarily halted!");

      console.log("\t", " 🔨 UnPause Staking...");
      await vendorContract.setPaused(false);
    });

    it("Owner should be able to withdraw balance from Vendor", async function () {
      const startingBalance = await ethers.provider.getBalance(msgSender);
      console.log(
        "\t",
        "Owner balance before withdraw: ",
        parseInt(ethers.utils.formatEther(startingBalance))
      );

      const vendorBalance = await vendorContract.balance();
      console.log(
        "\t",
        "Contract ETH balance before withdraw: ",
        parseInt(ethers.utils.formatEther(vendorBalance))
      );

      console.log("\t", " 💵 calling withdraw");
      const withdrawResult = await vendorContract.withdraw(vendorBalance);
      console.log("\t", " 🏷  withdrawResult: ", withdrawResult.hash);

      const endingBalance = await ethers.provider.getBalance(msgSender);
      console.log(
        "\t",
        "Owner balance after withdraw: ",
        parseInt(ethers.utils.formatEther(endingBalance))
      );

      expect(parseInt(ethers.utils.formatEther(endingBalance))).to.equal(
        parseInt(ethers.utils.formatEther(startingBalance)) +
          parseInt(ethers.utils.formatEther(vendorBalance))
      );

      await hre.network.provider.send("hardhat_reset");
    });
  });
});
