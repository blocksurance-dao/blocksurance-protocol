import hre from "hardhat";
const { ethers } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("🚩 Testing: 🥩  Gov Token!", function () {
  this.timeout(45000);

  let msgSender: any;
  let coinContract: any;
  let vendorContract: any;
  let govtokenContract: any;
  let registarContract: any;

  it("Should set env vars", async function () {
    await hre.network.provider.send("hardhat_reset");
    const [owner] = await ethers.getSigners();
    msgSender = owner.address;
  });
  it("Should deploy Registar", async function () {
    const registar = await ethers.getContractFactory("Registar");
    registarContract = await registar.deploy(msgSender);
    console.log("Registar contract: ", registarContract.address);
    expect(ethers.utils.isAddress(await registarContract.address)).to.be.equal(
      true
    );
  });

  it("Should deploy ERC20Coin", async function () {
    const Coin = await ethers.getContractFactory("ERC20Coin");
    coinContract = await Coin.deploy(
      "BLOCKSURANCE",
      "4SURE",
      500000000,
      msgSender
    );
    console.log("Coin contract: ", coinContract.address);
    expect(ethers.utils.isAddress(await coinContract.address)).to.be.equal(
      true
    );
  });

  it("Should deploy Vendor", async function () {
    const vendor = await ethers.getContractFactory("Vendor");
    vendorContract = await vendor.deploy(
      coinContract.address,
      registarContract.address,
      msgSender
    );
    console.log("Vendor contract: ", vendorContract.address);
    expect(ethers.utils.isAddress(await vendorContract.address)).to.be.equal(
      true
    );
  });

  it("Should deploy Governance Token", async function () {
    const govToken = await ethers.getContractFactory("BLOCKSURANCE");
    govtokenContract = await govToken.deploy({ gasLimit: 30000000 });

    await govtokenContract.initialize(
      coinContract.address,
      registarContract.address,
      msgSender,
      { gasLimit: 30000000 }
    );
    console.log("GOV token contract: ", govtokenContract.address);
    expect(ethers.utils.isAddress(await govtokenContract.address)).to.be.equal(
      true
    );
  });

  describe("Coin", function () {
    it("You should be able to mint tokens()", async function () {
      console.log("\t", " ⏳ Minting 250M tokens...");
      const oneBalance = await coinContract.balanceOf(govtokenContract.address);
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
          govtokenContract.address,
          ethers.utils.parseEther("500000001") // 500M
        )
      ).to.be.revertedWith("Not enough tokens left!");
    });

    it("You should be able to airdrop tokens()", async function () {
      console.log("\t", " ⏳ Airdropping some tokens...");
      const [owner, acc1] = await ethers.getSigners();
      const airResult = await coinContract.airdrop(
        [owner.address, acc1.address, govtokenContract.address],
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

  describe("Staker", function () {
    // ################**STAKER**################ //

    it("Should be able to set minimalStake variable", async () => {
      expect(await govtokenContract.getMinStake()).to.equal(
        ethers.utils.parseEther("20000")
      );
      await govtokenContract.setMinStake(ethers.utils.parseEther("30000"));
      expect(await govtokenContract.getMinStake()).to.equal(
        ethers.utils.parseEther("30000")
      );
      await govtokenContract.setMinStake(ethers.utils.parseEther("20000"));
      expect(await govtokenContract.getMinStake()).to.equal(
        ethers.utils.parseEther("20000")
      );
    });

    it("Should be able to set MaxStakingPeriod variable", async () => {
      expect(await govtokenContract.maxStakingPeriod()).to.equal(450);
      await govtokenContract.setMaxStakingPeriod(390);
      expect(await govtokenContract.maxStakingPeriod()).to.equal(390);
      await govtokenContract.setMaxStakingPeriod(450);
      expect(await govtokenContract.maxStakingPeriod()).to.equal(450);
    });

    it("Should be able to set minimalBuy variable", async () => {
      await vendorContract.setMinBuy(ethers.utils.parseEther("4000000"));
      expect(await vendorContract.getMinBuy()).to.equal(
        ethers.utils.parseEther("4000000") // 4M
      );
      await vendorContract.setMinBuy(ethers.utils.parseEther("5000000"));
      expect(await vendorContract.getMinBuy()).to.equal(
        ethers.utils.parseEther("5000000") // 5M
      );
    });

    it("Should be able to set rates variable", async () => {
      expect((await govtokenContract.getRates())[0]).to.equal(21);
      await govtokenContract.setRates(22, 34, 55);
      expect((await govtokenContract.getRates())[2]).to.equal(55);
      await govtokenContract.setRates(21, 33, 45);
      expect((await govtokenContract.getRates())[0]).to.equal(21);
    });

    it("Staking should fail after it is paused", async function () {
      console.log("\t", " 🔨 Request CoinContract to approve stake...");
      await coinContract.approve(
        govtokenContract.address,
        ethers.utils.parseEther("20000")
      );

      console.log("\t", " 🔨 Pause Staking...");
      await govtokenContract.stakingEnabled(false);

      await expect(
        govtokenContract.stakeTokens(ethers.utils.parseEther("20000"), 90)
      ).to.be.revertedWith("Staking is temporarily halted!");

      console.log("\t", " 🔨 UnPause Staking...");
      await govtokenContract.stakingEnabled(true);
    });

    it("Stake should go up when you stake()", async function () {
      console.log("\t", " 🧑‍🏫 Tester Address: ", msgSender);
      const [owner, acc1] = await ethers.getSigners();

      const rgResult = await registarContract
        .connect(acc1)
        .register(owner.address);
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from register function..."
      );
      const rtxResult = await rgResult.wait();
      expect(rtxResult.status).to.equal(1);

      console.log("\t", " 🔨 Request CoinContract to approve stake...");
      await coinContract
        .connect(acc1)
        .approve(govtokenContract.address, ethers.utils.parseEther("20000"));

      const startingStake = await govtokenContract.getUserStake(acc1.address);
      console.log(
        "\t",
        " ⚖️ Starting stake: ",
        startingStake?.amount?.toNumber()
      );

      const refBalance1 = await coinContract.balanceOf(msgSender);

      console.log("\t", " 🔨 Staking...");
      const stakeResult = await govtokenContract
        .connect(acc1)
        .stakeTokens(ethers.utils.parseEther("20000"), 90);
      console.log("\t", " 🏷  stakeResult: ", stakeResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await stakeResult.wait();
      expect(txResult.status).to.equal(1);

      const endingStake = await govtokenContract.getUserStake(acc1.address);
      console.log(
        "\t",
        " ⚖️ Ending stake: ",
        ethers.utils.formatEther(endingStake.amount)
      );
      expect(endingStake.amount).to.equal(
        startingStake.amount.add(ethers.utils.parseEther("20000"))
      );

      // Check that refferal address balance went up, refferal payout 4%
      const refBalance2 = await coinContract.balanceOf(msgSender);
      expect(refBalance2).to.equal(
        refBalance1.add(ethers.utils.parseEther("800"))
      );
    });

    it("Should retrieve token listing from contract", async function () {
      console.log("\t", " ⏳ Retrieving token listings...");
      const txResult = await govtokenContract.getActiveStakes();
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from getListings function..."
      );
      expect(txResult.length).to.equal(1);
    });

    it("After stake lockup expires, you should be able to burn stake", async function () {
      const Coin = await ethers.getContractFactory("ERC20Coin");
      coinContract = await Coin.deploy("iLAUNCH", "LAU", 100000000, msgSender);

      const vendor = await ethers.getContractFactory("Vendor");
      vendorContract = await vendor.deploy(
        coinContract.address,
        registarContract.address,
        msgSender
      );

      const govToken = await ethers.getContractFactory("BLOCKSURANCE");
      govtokenContract = await govToken.deploy({ gasLimit: 30000000 });

      await govtokenContract.initialize(
        coinContract.address,
        registarContract.address,
        msgSender,
        { gasLimit: 30000000 }
      );
      console.log("GOV token contract: ", govtokenContract.address);
      expect(
        ethers.utils.isAddress(await govtokenContract.address)
      ).to.be.equal(true);

      console.log("\t", " ⏳ Minting 8M tokens...");
      const mintResult = await coinContract.mint(
        vendorContract.address,
        ethers.utils.parseEther("8000000")
      );
      console.log("\t", " ⏳ Waiting for confirmation from mint function...");
      const txResult2 = await mintResult.wait();
      expect(txResult2.status).to.equal(1);
      await coinContract.mint(
        govtokenContract.address,
        ethers.utils.parseEther("1000000")
      );
      console.log("\t", " 🔨 Toast!");

      console.log("\t", " 🔨 Buying...");
      const buyResult = await vendorContract.buyTokens({
        value: ethers.utils.parseEther("80"),
      });
      console.log("\t", " 🏷  buyResult: ", buyResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult3 = await buyResult.wait();
      expect(txResult3.status).to.equal(1);

      console.log("\t", " 🔨 Request CoinContract to approve stake...");
      const approveResult = await coinContract.approve(
        govtokenContract.address,
        ethers.utils.parseEther("20000")
      );
      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult4 = await approveResult.wait();
      expect(txResult4.status).to.equal(1);

      console.log("\t", " ⏳ Staking...");
      const stakeResult = await govtokenContract.stakeTokens(
        ethers.utils.parseEther("20000"),
        270
      );
      console.log("\t", " 🏷  stakeResult: ", stakeResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult5 = await stakeResult.wait();
      expect(txResult5.status).to.equal(1);

      const startingStake = await govtokenContract.getUserStake(msgSender);

      console.log(
        "\t",
        " ⚖️ Starting stake: ",
        ethers.utils.formatEther(startingStake.amount)
      );
      expect(startingStake.amount).to.equal(ethers.utils.parseEther("20000"));

      console.log("\t", " ⌛️ fast forward time...");
      await hre.network.provider.send("evm_increaseTime", [72000000]);
      await hre.network.provider.send("evm_mine");

      console.log("\t", " ⏳ Burning Stake...");
      const burnResult1 = await govtokenContract.burnStake(msgSender);
      console.log("\t", " 🏷  burnResult: ", burnResult1.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult6 = await burnResult1.wait();
      expect(txResult6.status).to.equal(1);

      const endingStake = await govtokenContract.getUserStake(msgSender);
      console.log(
        "\t",
        " ⚖️ Ending stake: ",
        ethers.utils.formatEther(endingStake.amount)
      );
      expect(endingStake.amount).to.equal(0);
    });

    it("Should retrieve token listing from contract", async function () {
      console.log("\t", " ⏳ Retrieving token listings...");
      const txResult = await govtokenContract.getActiveStakes();
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from getListings function..."
      );
      expect(txResult.length).to.equal(0);
    });

    it("Staker should be able to transfer tokens out()", async function () {
      console.log("\t", " ⏳ Transfering some tokens...");
      const contractBalance = await coinContract.balanceOf(
        govtokenContract.address
      );
      console.log(
        "\t",
        "Contract token balance: ",
        ethers.utils.formatEther(contractBalance)
      );
      const startingBalance = await coinContract.balanceOf(msgSender);
      const ttransfer = await govtokenContract.transferTokens(
        ethers.utils.parseEther("10000")
      );
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from transferTokens function..."
      );
      const txResult = await ttransfer.wait();
      expect(txResult.status).to.equal(1);
      const endingBalance = await coinContract.balanceOf(msgSender);
      expect(endingBalance).to.equal(
        startingBalance.add(ethers.utils.parseEther("10000"))
      );
    });

    it("Owner should be able to set min Stake amount", async function () {
      console.log("\t", " 💵 calling withdraw");
      const setResult = await govtokenContract.setMinStake(
        ethers.utils.parseEther("50000")
      );
      console.log("\t", " 🏷  setResult: ", setResult.hash);
      const getResult = await govtokenContract.getMinStake();
      expect(getResult).to.equal(ethers.utils.parseEther("50000"));

      // ################**RESET**################ //
      await hre.network.provider.send("hardhat_reset");
    });
  });
});
