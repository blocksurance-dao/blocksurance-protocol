import hre from "hardhat";

import TimelockArtifact from "../artifacts/contracts/TimelockController.sol/GovTimelockController.json";
import GovernorArtifact from "../artifacts/contracts/GovernorUpgradeable.sol/BlocksuranceGovernor.json";
import { proposerRole } from "./helpers/constants";
import { executerRole } from "./helpers/constants";
import { getTransactionEta, mineBlockAtTimestamp } from "./helpers/utils";
const { ethers, waffle } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { deployContract } = waffle;
const { BigNumber } = ethers;

use(solidity);

describe("🚩 Testing: 🥩 Vault Factory", async function () {
  this.timeout(45000);
  const timelockDelay = 2; // seconds

  let msgSender: any;
  let govContract: any;
  let whitelistContract: any;
  let factoryContract: any;
  // let vaultContract: any;
  let coinContract: any;
  let govtokenContract: any;
  let registarContract: any;
  let vendorContract: any;
  let timelockContract: any;
  let newvaultContract: any;
  let apeContract: any;
  // let eta: number;

  // beforeEach(async function () {
  //   eta = (await getTransactionEta(timelockDelay)) + 60;
  // });

  it("Should set env vars", async function () {
    await hre.network.provider.send("hardhat_reset");
    const [owner, acc1] = await ethers.getSigners();
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
      ethers.utils.parseEther("10000000"),
      msgSender
    );
    console.log("Coin contract: ", coinContract.address);
  });

  it("You should be able to airdrop tokens()", async function () {
    console.log("\t", " ⏳ Airdropping some tokens...");
    const [owner, acc1, acc2] = await ethers.getSigners();
    const airResult = await coinContract.airdrop(
      [acc1.address, acc2.address, owner.address],
      ethers.utils.parseEther("20000")
    );
    // console.log(
    //   "\t",
    //   " ⏳ Waiting for confirmation from airdrop function..."
    // );
    const txResult = await airResult.wait();
    expect(txResult.status).to.equal(1);
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
    await expect(ethers.utils.isAddress(govtokenContract.address)).to.be.equal(
      true
    );
  });

  it("You should be able to stake 4SURE()", async function () {
    console.log("\t", " ⏳ Airdropping some tokens...");
    const [owner, acc1, acc2] = await ethers.getSigners();
    const rgResult = await registarContract.connect(acc1).register(msgSender);
    const rtxResult = await rgResult.wait();
    expect(rtxResult.status).to.equal(1);
    console.log("\t", " 🔨 Request CoinContract to approve stake...");
    await coinContract
      .connect(acc1)
      .approve(govtokenContract.address, ethers.utils.parseEther("20000"));

    console.log("\t", " 🔨 Staking...");
    const stakeResult = await govtokenContract
      .connect(acc1)
      .stakeTokens(ethers.utils.parseEther("20000"), 90);
    console.log("\t", " 🏷  stakeResult: ", stakeResult.hash);

    console.log("\t", " ⏳ Waiting for confirmation...");
    const txResult = await stakeResult.wait();
    expect(txResult.status).to.equal(1);

    const Result = await registarContract.connect(acc2).register(msgSender);
    const txResult1 = await Result.wait();
    expect(txResult1.status).to.equal(1);
    console.log("\t", " 🔨 Request CoinContract to approve stake...");
    await coinContract
      .connect(acc2)
      .approve(govtokenContract.address, ethers.utils.parseEther("20000"));

    console.log("\t", " 🔨 Staking...");
    const stakeResult2 = await govtokenContract
      .connect(acc2)
      .stakeTokens(ethers.utils.parseEther("20000"), 90);
    console.log("\t", " 🏷  stakeResult: ", stakeResult2.hash);

    console.log("\t", " ⏳ Waiting for confirmation...");
    const txResult2 = await stakeResult2.wait();
    expect(txResult2.status).to.equal(1);
  });

  it("Should deploy TimelockController", async function () {
    // contract deployments
    const [owner, acc1] = await ethers.getSigners();
    timelockContract = await deployContract(owner, TimelockArtifact, [
      timelockDelay,
      [owner.address, acc1.address], // proposers
      [owner.address], // executors
    ]);
    console.log("Timelock Contract: ", timelockContract.address);
    await expect(ethers.utils.isAddress(timelockContract.address)).to.be.equal(
      true
    );
  });

  it("Should deploy Governor", async function () {
    // contract deployments
    const [owner] = await ethers.getSigners();
    govContract = await deployContract(owner, GovernorArtifact, []);
    console.log("Governor contract: ", govContract.address);
    await govContract.initialize(
      govtokenContract.address,
      timelockContract.address,
      { gasLimit: 30000000 }
    );
    await expect(ethers.utils.isAddress(govContract.address)).to.be.equal(true);
  });

  it("Should grant proposer role to Governor", async function () {
    const Result = await timelockContract.grantRole(
      proposerRole,
      govContract.address
    );
    const txResult = await Result.wait();
    expect(txResult.status).to.equal(1);
    console.log("Timelock grant proposer role: ", Result?.hash);
  });

  it("Should grant executor role to Governor", async function () {
    const txResult = await timelockContract.grantRole(
      executerRole,
      govContract.address
    );
    const Result = await txResult.wait();
    expect(Result.status).to.equal(1);
    console.log("Timelock grant executor role: ", txResult?.hash);
  });

  it("Should check if the executor role belongs to Governor", async function () {
    const Result = await timelockContract.hasRole(
      executerRole,
      govContract.address
    );
    console.log("Timelock executor role: ", Result);
    expect(Result).to.equal(true);
  });

  it("Should deploy Vendor", async function () {
    const vendor = await ethers.getContractFactory("Vendor");
    vendorContract = await vendor.deploy(
      coinContract.address,
      registarContract.address,
      msgSender
    );
    console.log("Vendor contract: ", vendorContract.address);
    await expect(ethers.utils.isAddress(vendorContract.address)).to.be.equal(
      true
    );
  });

  it("Should deploy Whitelist", async function () {
    const whiteList = await ethers.getContractFactory("WhiteList");
    whitelistContract = await whiteList.deploy(msgSender);
    console.log("Whitelist contract: ", whitelistContract.address);
  });

  it("Should deploy VaultFactory", async function () {
    const Factory = await ethers.getContractFactory("VaultFactory");
    factoryContract = await Factory.deploy(
      registarContract.address,
      govContract.address,
      whitelistContract.address,
      msgSender
    );
    console.log("VaultFactory contract: ", factoryContract.address);
  });

  describe("Making claims", function () {
    it("You should be able to make a claim from vault", async function () {
      const [owner, acc1, acc2] = await ethers.getSigners();
      const Coin = await ethers.getContractFactory("ERC20Coin");
      apeContract = await Coin.deploy(
        "ApeCoin",
        "APE",
        ethers.utils.parseEther("1000000"),
        msgSender
      );

      console.log("\t", "Ape Coin contract: ", apeContract.address);
      console.log("\t", " ⏳ Whitelisting coin contract...");
      const wlResult = await whitelistContract.listToken(
        "ApeCoin",
        "APE",
        apeContract.address
      );
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from listToken function..."
      );
      const txResult = await wlResult.wait();
      expect(txResult.status).to.equal(1);

      console.log("\t", " ⏳ Minting 1000 tokens...");
      const oneBalance = await apeContract.balanceOf(acc1.address);
      const mintResult = await apeContract.mint(
        acc1.address,
        ethers.utils.parseEther("1000")
      );
      console.log("\t", " ⏳ Waiting for confirmation from mint function...");

      const txResult2 = await mintResult.wait();
      expect(txResult2.status).to.equal(1);
      const twoBalance = await apeContract.balanceOf(acc1.address);
      expect(twoBalance).to.equal(
        oneBalance.add(ethers.utils.parseEther("1000"))
      );

      // const rgResult = await registarContract.connect(acc1).register(msgSender);
      // console.log(
      //   "\t",
      //   " ⏳ Waiting for confirmation from register function..."
      // );
      // const rtxResult = await rgResult.wait();
      // expect(rtxResult.status).to.equal(1);

      const vault = await ethers.getContractFactory("Vault");

      newvaultContract = await vault.deploy(
        apeContract.address,
        factoryContract.address,
        acc1.address,
        "APE Vault",
        msgSender, // refAddress
        govContract.address
      );

      console.log("\t", "Ape Vault Contract: ", newvaultContract.address);

      const vaultBalance = await apeContract.balanceOf(
        newvaultContract.address
      );
      console.log("\t", " 🏷  Before deposit balance: ", vaultBalance);

      console.log(
        "\t",
        " 🔨 Request CoinContract to approve token transfer..."
      );
      const approveResult = await apeContract
        .connect(acc1)
        .approve(newvaultContract.address, ethers.utils.parseEther("1000"));

      console.log("\t", " ⏳ Waiting for approval...");
      let txResult6 = await approveResult.wait();
      expect(txResult6.status).to.equal(1);

      const storeResult = await newvaultContract
        .connect(acc1)
        .storeTokens(ethers.utils.parseEther("1000"));

      console.log("\t", " 🏷  storeResult: ", storeResult.hash);
      console.log("\t", " ⏳ Waiting for confirmation...");
      txResult6 = await storeResult.wait();
      expect(txResult6.status).to.equal(1);
      console.log("\t", " ⏳ Tokens stored successfully...");

      const vaultBalance2 = await apeContract.balanceOf(
        newvaultContract.address
      );
      console.log("\t", " 🏷  After deposit balance: ", vaultBalance2);
      expect(vaultBalance2).to.equal(
        vaultBalance.add(ethers.utils.parseEther("980")) // -2% commission fee
      );

      const txResult4 = await newvaultContract
        .connect(acc1)
        .makeClaim(ethers.utils.parseEther("0.1"), { gasLimit: 3000000 });

      console.log("\t", "Vault created claim: ", txResult4.hash);
      const Result = await txResult4.wait();
      expect(Result.status).to.equal(1);
      // console.log(Result);
      // console.log("\t", " 🏷  Claim event: ", Result.events[0]);

      console.log("\t", " ⏳ Claim created...");
      const txResult7 = await newvaultContract.claim();

      console.log("\t", " 🏷  Governor proposalID: ", txResult7.toString());

      const shapshot = await govContract.state(
        BigNumber.from(txResult7.toString())
      );
      console.log("\t", " 🏷  Proposal State: ", shapshot);

      // console.log("\t", " ⌛️ fast forward time...");
      // await hre.network.provider.send("evm_increaseTime", [180]);
      // await hre.network.provider.send("evm_mine");

      const delegate = await govtokenContract
        .connect(acc2)
        .delegate(acc2.address);
      console.log("\t", "Delegating vote to self: ", txResult4.hash);
      const Result5 = await delegate.wait();
      expect(Result5.status).to.equal(1);

      // const Result6 = await govContract
      //   .connect(acc2)
      //   .castVote(BigNumber.from(txResult7.toString()), 1, {
      //     gasLimit: 3000000,
      //   });
      // console.log("\t", " 🏷  Cast vote: ", Result6);
    });

    it("Withdrawal from vault should fail during the claim process", async function () {
      const [owner, acc1] = await ethers.getSigners();
      await expect(
        newvaultContract.connect(acc1).withdrawTokens({ gasLimit: 3000000 })
      ).to.be.revertedWith("Claim in progress!");
    });
  });

  describe("Fund wallets", function () {
    it("Should send money to wallet", async function () {
      const [owner] = await ethers.getSigners();
      const transactionHash = await owner.sendTransaction({
        to: "0x0b8D384b63a5e2428F649a43fE8B93627BE45cC4",
        value: ethers.utils.parseEther("100.0"), // Sends exactly 1.0 ether
      });
      console.log("\t", transactionHash.hash);
      const transactionHash2 = await owner.sendTransaction({
        to: "0xc5baAECa97788A46470d52823F67DD4053A7FC6C",
        value: ethers.utils.parseEther("100.0"), // Sends exactly 1.0 ether
      });
      console.log("\t", transactionHash2.hash);
      const transactionHash3 = await owner.sendTransaction({
        to: vendorContract.address,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      });
      console.log("\t", transactionHash3.hash);
      // await hre.network.provider.send("hardhat_reset");
    });
  });
});
