import hre from "hardhat";
const { ethers } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");

use(solidity);

describe("🚩 Testing: 🥩 Vault Factory", async function () {
  this.timeout(45000);

  let msgSender: any;
  let whitelistContract: any;
  let factoryContract: any;
  let vaultContract: any;
  let coinContract: any;
  let govtokenContract: any;
  let registarContract: any;
  let vendorContract: any;

  it("Should set env vars", async function () {
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

  // it("Should deploy StakerRewards", async function () {
  //   const staker = await ethers.getContractFactory("BLOCKVOTES");
  //   govtokenContract = await staker.deploy(
  //     coinContract.address,
  //     registarContract.address
  //   );
  //   console.log("Staker contract: ", govtokenContract.address);
  // });

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

  it("Should deploy Whitelist", async function () {
    const whiteList = await ethers.getContractFactory("WhiteList");
    whitelistContract = await whiteList.deploy(msgSender);
    console.log("Whitelist contract: ", whitelistContract.address);
  });

  it("Should deploy VaultFactory", async function () {
    const Factory = await ethers.getContractFactory("VaultFactory");
    factoryContract = await Factory.deploy(
      registarContract.address,
      whitelistContract.address,
      msgSender
    );
    console.log("VaultFactory contract: ", factoryContract.address);
  });
  it("Should deploy Vault", async function () {
    const vault = await ethers.getContractFactory("Vault");
    const [owner, acc1] = await ethers.getSigners();
    vaultContract = await vault.deploy(
      coinContract.address,
      factoryContract.address,
      msgSender,
      "Vault 1",
      acc1.address // refAddress
    );
  });

  describe("Coin", function () {
    it("You should be able to mint tokens()", async function () {
      console.log("\t", " ⏳ Minting 8M tokens...");
      const oneBalance = await coinContract.balanceOf(msgSender);
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

    it("You should be able to airdrop tokens()", async function () {
      console.log("\t", " ⏳ Airdropping some tokens...");
      const airResult = await coinContract.airdrop(
        [msgSender, vendorContract.address, govtokenContract.address],
        ethers.utils.parseEther("300000")
      );
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from airdrop function..."
      );
      const txResult = await airResult.wait();
      expect(txResult.status).to.equal(1);
    });
  });

  describe("Whitelist", function () {
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

    it("Should add tokens to whitelist", async function () {
      console.log("\t", " ⏳ Whitelisting coin contract...");
      const wlResult = await whitelistContract.listToken(
        "BLCOKSURANCE",
        "4SURE",
        coinContract.address
      );
      console.log(
        "\t",
        " ⏳ Waiting for confirmation from listToken function..."
      );
      const txResult = await wlResult.wait();
      expect(txResult.status).to.equal(1);
    });

    it("Should create another coin", async function () {
      const Coin = await ethers.getContractFactory("ERC20Coin");
      const newContract = await Coin.deploy(
        "SNOOP",
        "DOGGY",
        ethers.utils.parseEther("10000000"),
        msgSender
      );
      console.log("\t", "Last Coin contract: ", newContract.address);
    });
  });

  describe("VaultFactory", function () {
    it("You should be able to createVault()", async function () {
      console.log("\t", " 🔨 Starting new vault...");
      const startResult = await factoryContract.createVault(
        coinContract.address,

        "Vault 1",
        { value: ethers.utils.parseEther("0.005") }
      );
      console.log("\t", " 🏷  startResult: ", startResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await startResult.wait();
      expect(txResult.status).to.equal(1);
      console.log("\t", " 🏷  Vault Contract: ", txResult.events[0].address);

      console.log("\t", " ⏳ New vault deployed successfully...");

      const newBalance = await factoryContract.balance();
      expect(newBalance).to.equal(ethers.utils.parseEther("0.005"));
      console.log("\t", " ⏳ Contract balance increased accordingly...");
    });

    it("Should be able to retrieve user vaults", async function () {
      console.log("\t", " 🔨 Retrieving vaults...");
      const vaults = await factoryContract.getUserVaults(msgSender);

      console.log("\t", " ⏳ Waiting for confirmation...");
      console.log("\t", "Retrieved vault: ", vaults[0].vaultName);
      expect(vaults[0].vaultName).to.equal("Vault 1");
    });
  });

  describe("Vault", function () {
    it("You should be able to deposit tokens to vault", async function () {
      console.log("\t", " 🔨 Deposit tokens to vault...");
      const [owner, acc1] = await ethers.getSigners();
      const oneBalance = await coinContract.balanceOf(vaultContract.address);

      console.log(
        "\t",
        " 🔨 Request CoinContract to approve token transfer..."
      );
      const approveResult = await coinContract.approve(
        vaultContract.address,
        ethers.utils.parseEther("2")
      );
      console.log("\t", " ⏳ Waiting for approval...");
      let txResult = await approveResult.wait();
      expect(txResult.status).to.equal(1);

      const refBalance1 = await coinContract.balanceOf(acc1.address);

      const storeResult = await vaultContract.storeTokens(
        ethers.utils.parseEther("2")
      );

      console.log("\t", " 🏷  storeResult: ", storeResult.hash);
      console.log("\t", " ⏳ Waiting for confirmation...");
      txResult = await storeResult.wait();
      expect(txResult.status).to.equal(1);
      console.log("\t", " ⏳ Tokens stored successfully...");

      const refBalance2 = await coinContract.balanceOf(acc1.address);
      expect(refBalance2).to.equal(
        refBalance1.add(ethers.utils.parseEther("0.01")) // 0.5% referral fee
      );

      const twoBalance = await coinContract.balanceOf(vaultContract.address);
      expect(twoBalance).to.equal(
        oneBalance.add(ethers.utils.parseEther("1.96")) // 2% deposit fee
      );
      console.log("\t", " ⏳ Vault balance increased accordingly...");
    });

    it("You should be able to withdraw tokens from vault", async function () {
      console.log("\t", " 🔨 Withdraw tokens from vault...");
      const oneBalance = await coinContract.balanceOf(vaultContract.address);

      const storeResult = await vaultContract.withdrawTokens();
      console.log("\t", " 🏷  withdrawResult: ", storeResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await storeResult.wait();
      expect(txResult.status).to.equal(1);

      console.log("\t", " ⏳ Withdrawal successfully...");

      const twoBalance = await coinContract.balanceOf(vaultContract.address);
      expect(twoBalance).to.equal(
        oneBalance.sub(ethers.utils.parseEther("1.96"))
      );
      console.log("\t", " ⏳ Vault balance decreased accordingly...");
    });

    it("Main vault balance should increase accordingly", async function () {
      console.log("\t", " 🔨 Withdraw tokens from vault...");
      const oneBalance = await coinContract.balanceOf(factoryContract.address);

      expect(oneBalance).to.equal(ethers.utils.parseEther("0.03"));
      console.log("\t", " ⏳ Main Vault balance decreased accordingly...");
    });

    it("You should be able to transfer tokens from mainVault", async function () {
      console.log("\t", " 🔨 Withdraw tokens from vault...");
      const oneBalance = await coinContract.balanceOf(factoryContract.address);

      expect(oneBalance).to.equal(ethers.utils.parseEther("0.03"));
      console.log("\t", " ⏳ Main Vault balance decreased accordingly...");

      const startResult = await factoryContract.transferTokens(
        coinContract.address,
        msgSender,
        oneBalance
      );
      console.log("\t", " 🏷  startResult: ", startResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await startResult.wait();
      expect(txResult.status).to.equal(1);
    });
  });

  describe("VaultFactory 2", function () {
    it("You should be able to withdraw from VaultFactory", async function () {
      console.log("\t", " 🔨 Withdraw balance ...");
      const wResult = await factoryContract.withdraw(
        ethers.utils.parseEther("0.005")
      );
      console.log("\t", " 🏷  Result: ", wResult.hash);

      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await wResult.wait();
      expect(txResult.status).to.equal(1);

      const newBalance = await factoryContract.balance();
      expect(newBalance).to.equal(ethers.utils.parseEther("0"));
      console.log("\t", " ⏳ Contract balance decreased accordingly...");
    });

    it("Deploy a few vaults for testing", async function () {
      console.log("\t", " 🔨 Starting new vault...");
      const startResult = await factoryContract.createVault(
        coinContract.address,

        "Vault 2",
        { value: ethers.utils.parseEther("0.005") }
      );
      console.log("\t", " 🏷  startResult: ", startResult.hash);
      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await startResult.wait();
      expect(txResult.status).to.equal(1);
      console.log("\t", " 🏷  Vault Contract: ", txResult.events[0].address);
      console.log("\t", " ⏳ New vault deployed successfully...");
    });

    it("Deploy a few vaults for testing", async function () {
      console.log("\t", " 🔨 Starting new vault...");
      const startResult = await factoryContract.createVault(
        coinContract.address,
        "Vault 3",
        { value: ethers.utils.parseEther("0.005") }
      );
      console.log("\t", " 🏷  startResult: ", startResult.hash);
      console.log("\t", " ⏳ Waiting for confirmation...");
      const txResult = await startResult.wait();
      expect(txResult.status).to.equal(1);
      console.log("\t", " 🏷  Vault Contract: ", txResult.events[0].address);
      console.log("\t", " ⏳ New vault deployed successfully...");
    });

    it("Should send money to wallet", async function () {
      const [owner] = await ethers.getSigners();
      // const transactionHash = await owner.sendTransaction({
      //   to: "your metamask burner address",
      //   value: ethers.utils.parseEther("100.0"), // Sends exactly 1.0 ether
      // });
      // console.log("\t", transactionHash.hash);
      // const transactionHash2 = await owner.sendTransaction({
      //   to: "your metamask burner address2",
      //   value: ethers.utils.parseEther("100.0"), // Sends exactly 1.0 ether
      // });
      // console.log("\t", transactionHash2.hash);
      const transactionHash3 = await owner.sendTransaction({
        to: vendorContract.address,
        value: ethers.utils.parseEther("1.0"), // Sends exactly 1.0 ether
      });
      console.log("\t", transactionHash3.hash);
      await hre.network.provider.send("hardhat_reset");
    });
  });
});
