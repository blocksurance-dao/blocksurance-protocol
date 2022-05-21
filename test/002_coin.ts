import hre from "hardhat";
const { ethers } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("🚩 Testing: 🥩 Coin Factory", function () {
  this.timeout(45000);

  let msgSender: any;
  let vendorContract: any;
  let coinContract: any;
  let registarContract: any;
  const tokensPerEth = 40000;

  it("Should set env vars", async function () {
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
      100000000,
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
      console.log("\t", " ⏳ Minting 5M tokens...");
      const oneBalance = await coinContract.balanceOf(vendorContract.address);
      const mintResult = await coinContract.mint(
        vendorContract.address,
        ethers.utils.parseEther("8000000")
      );
      console.log("\t", " ⏳ Waiting for confirmation from mint function...");
      const txResult = await mintResult.wait();
      expect(txResult.status).to.equal(1);
      const twoBalance = await coinContract.balanceOf(vendorContract.address);
      expect(twoBalance).to.equal(
        oneBalance.add(ethers.utils.parseEther("8000000"))
      );
    });
    it("should fail if you try to mint an amount greater than the hard cap", async () => {
      await expect(
        coinContract.mint(
          vendorContract.address,
          ethers.utils.parseEther("500000001")
        )
      ).to.be.revertedWith("Not enough tokens left!");
    });
    it("You should be able to airdrop tokens()", async function () {
      console.log("\t", " ⏳ Airdropping some tokens...");
      const airResult = await coinContract.airdrop(
        [vendorContract.address],
        ethers.utils.parseEther("50000")
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
    it("Balance should go up when you buyTokens()", async function () {
      console.log("\t", " 🧑‍🏫 Tester Address: ", msgSender);

      const startingBalance = await coinContract.balanceOf(msgSender);
      console.log("\t", " ⚖️ Starting balance: ", startingBalance.toNumber());

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
        ethers.utils.parseEther((80 * tokensPerEth).toString())
      );
    });

    it("Owner should be able to withdraw balance from Vendor", async function () {
      const contractBalance = await vendorContract.balance();
      console.log(
        "Owner balance before withdraw: ",
        parseInt(ethers.utils.formatEther(contractBalance))
      );

      console.log("\t", " 💵 calling withdraw");
      const withdrawResult = await vendorContract.withdraw(contractBalance);
      console.log("\t", " 🏷  withdrawResult: ", withdrawResult.hash);

      const endingBalance = await vendorContract.balance();
      console.log(
        "Owner balance after withdraw: ",
        parseInt(ethers.utils.formatEther(endingBalance))
      );

      expect(parseInt(endingBalance)).to.equal(0);
      await hre.network.provider.send("hardhat_reset");
    });
  });
});
