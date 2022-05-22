import hre from "hardhat";
import { User } from "./helpers/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  getTransactionEta,
  generateMultisigWallet,
  mineBlockAtTimestamp,
} from "./helpers/utils";

import TimelockArtifact from "../artifacts/contracts/TimelockController.sol/GovTimelockController.json";
import GovernorArtifact from "../artifacts/contracts/GovernorUpgradeable.sol/BlocksuranceGovernor.json";
import { Contract } from "ethers";
import MockContractArtifact from "../artifacts/contracts/mocks/MockContract.sol/MockContract.json";

const { ethers, waffle } = hre;
const { use, expect } = require("chai");
const { solidity } = require("ethereum-waffle");
const { deployContract } = waffle;
const { AddressZero, HashZero } = ethers.constants;
use(solidity);

describe("🚩 Testing: 🥩 Governance", async function () {
  this.timeout(45000);
  const timelockDelay = 2; // seconds

  let coinContract: any;
  let govcoinContract: any;
  let registarContract: any;
  let timelockContract: any;
  let govContract: any;

  let admin: User;
  let walletSigner1: User;
  let walletSigner2: User;
  let multisigDeployer: User;
  let gnosisSafeWallet: Contract;
  let executor: User;
  let proposer: User;
  let canceler: User;
  // let proposerDefinedOnCreation: User;
  let receiver: User;
  // let proposedAdminAddress: string;
  let eta: number;

  const proposerRole =
    "0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1";
  const executorRole =
    "0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63";
  const cancellerRole =
    "0xebfdca8e46c0b8dacf9989ee613e35727eadd20a1d5e5ad01a53968c7e5fe07a";
  // const timelockAdmin = "0x5f58e3a2316349923ce3780f8d587db2d72378aed66a8261c916544fa6846ca5";

  before(async function () {
    // await hre.network.provider.send("hardhat_reset");
    const signers: SignerWithAddress[] = await ethers.getSigners();
    admin = {
      signer: signers[0],
      address: await signers[0].getAddress(),
    };
    proposer = {
      signer: signers[1],
      address: await signers[1].getAddress(),
    };
    executor = {
      signer: signers[2],
      address: await signers[2].getAddress(),
    };
    canceler = {
      signer: signers[3],
      address: await signers[3].getAddress(),
    };
    walletSigner1 = {
      signer: signers[1],
      address: await signers[1].getAddress(),
    };
    walletSigner2 = {
      signer: signers[2],
      address: await signers[2].getAddress(),
    };
    multisigDeployer = {
      signer: signers[3],
      address: await signers[3].getAddress(),
    };
    // proposerDefinedOnCreation = {
    //   signer: signers[4],
    //   address: await signers[4].getAddress(),
    // };
    receiver = {
      signer: signers[5],
      address: await signers[5].getAddress(),
    };

    // proposedAdminAddress = await signers[3].getAddress();
  });

  beforeEach(async function () {
    eta = (await getTransactionEta(timelockDelay)) + 3;
  });

  it("Should deploy GnosisSafe", async function () {
    const walletSigners = [walletSigner1.address, walletSigner2.address];

    // deploy gnosisSafe wallet
    gnosisSafeWallet = await generateMultisigWallet(
      walletSigners,
      1,
      multisigDeployer
    );
    console.log("gnosisSafeWallet address: ", gnosisSafeWallet.address);
    expect(ethers.utils.isAddress(await gnosisSafeWallet.address)).to.be.equal(
      true
    );
  });

  it("Should deploy TimelockController", async function () {
    // contract deployments
    timelockContract = await deployContract(admin.signer, TimelockArtifact, [
      timelockDelay,
      [admin.address, proposer.address], // proposers
      [executor.address, gnosisSafeWallet.address], // executors
    ]);
    console.log("Timelock Contract: ", timelockContract.address);
    expect(ethers.utils.isAddress(await timelockContract.address)).to.be.equal(
      true
    );
  });

  it("Should deploy Registar", async function () {
    const registar = await ethers.getContractFactory("Registar");
    registarContract = await registar.deploy(admin.address);
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
      ethers.utils.parseEther("10000000"),
      admin.address // gnosisSafeWallet.address
    );
    console.log("Coin contract: ", coinContract.address);
    expect(ethers.utils.isAddress(await coinContract.address)).to.be.equal(
      true
    );
  });

  it("You should be able to mint tokens()", async function () {
    console.log("\t", " ⏳ Minting 5M tokens...");
    const oneBalance = await coinContract.balanceOf(proposer.address);
    const mintResult = await coinContract
      .connect(admin.signer)
      .mint(proposer.address, ethers.utils.parseEther("80000"));
    console.log("\t", " ⏳ Waiting for confirmation from mint function...");
    const txResult = await mintResult.wait();
    expect(txResult.status).to.equal(1);
    const twoBalance = await coinContract.balanceOf(proposer.address);
    expect(twoBalance).to.equal(
      oneBalance.add(ethers.utils.parseEther("80000"))
    );
  });

  it("Should deploy Governance Token", async function () {
    const govToken = await ethers.getContractFactory("BLOCKSURANCE");
    govcoinContract = await govToken.deploy({ gasLimit: 30000000 });
    // await coinContract.initialize({ gasLimit: 30000000 });
    await govcoinContract.initialize(
      coinContract.address,
      registarContract.address,
      gnosisSafeWallet.address,
      { gasLimit: 30000000 }
    );
    console.log("GOV token contract: ", govcoinContract.address);
    expect(ethers.utils.isAddress(await govcoinContract.address)).to.be.equal(
      true
    );
  });

  it("Stake should go up when you stake()", async function () {
    const rgResult = await registarContract
      .connect(proposer.signer)
      .register(admin.address);
    console.log("\t", " ⏳ Waiting for confirmation from register function...");
    const rtxResult = await rgResult.wait();
    expect(rtxResult.status).to.equal(1);

    console.log("\t", " 🔨 Request CoinContract to approve stake...");
    await coinContract
      .connect(proposer.signer)
      .approve(govcoinContract.address, ethers.utils.parseEther("20000"));

    const startingStake = await govcoinContract.getUserStake(proposer.address);
    console.log(
      "\t",
      " ⚖️ Starting stake: ",
      startingStake?.amount?.toNumber()
    );

    const refBalance1 = await coinContract.balanceOf(proposer.address);

    console.log("\t", " 🔨 Staking...");
    const stakeResult = await govcoinContract
      .connect(proposer.signer)
      .stakeTokens(ethers.utils.parseEther("20000"), 90);
    console.log("\t", " 🏷  stakeResult: ", stakeResult.hash);

    console.log("\t", " ⏳ Waiting for confirmation...");
    const txResult = await stakeResult.wait();
    expect(txResult.status).to.equal(1);

    const endingStake = await govcoinContract.getUserStake(proposer.address);
    console.log(
      "\t",
      " ⚖️ Ending stake: ",
      ethers.utils.formatEther(endingStake.amount)
    );
    expect(endingStake.amount).to.equal(
      startingStake.amount.add(ethers.utils.parseEther("20000"))
    );

    // Check that refferal address balance went up, refferal payout 4%
    const refBalance2 = await coinContract.balanceOf(proposer.address);
    expect(refBalance2).to.equal(
      refBalance1.sub(ethers.utils.parseEther("20000"))
    );

    const govtokenBalance = await govcoinContract.balanceOf(proposer.address);
    console.log(
      "\t",
      " ⚖️ Gov Token Balance: ",
      ethers.utils.formatEther(govtokenBalance)
    );
    expect(govtokenBalance).to.equal(ethers.utils.parseEther("20000"));
  });

  it("Should deploy Governor", async function () {
    // contract deployments
    govContract = await deployContract(admin.signer, GovernorArtifact, []);
    console.log("Governor contract: ", govContract.address);
    await govContract.initialize(
      govcoinContract.address,
      timelockContract.address,
      { gasLimit: 30000000 }
    );
    expect(ethers.utils.isAddress(await govContract.address)).to.be.equal(true);
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
      executorRole,
      govContract.address
    );
    console.log("Timelock grant executor role: ", txResult?.hash);
    const Result = await txResult.wait();
    expect(Result.status).to.equal(1);
  });

  it("Should check if the executor role belongs to Governor", async function () {
    const Result = await timelockContract.hasRole(
      executorRole,
      govContract.address
    );
    console.log("Timelock executor role: ", Result);
    expect(Result).to.equal(true);
  });

  it("Should grant canceller role to GnosisSafe", async function () {
    const Result = await timelockContract.grantRole(
      cancellerRole,
      gnosisSafeWallet.address
    );
    const txResult = await Result.wait();
    expect(txResult.status).to.equal(1);
    console.log("Grant canceler role to Gnosis: ", Result?.hash);

    const Result2 = await timelockContract.hasRole(
      cancellerRole,
      gnosisSafeWallet.address
    );

    console.log("Confirm Gnosis canceler role: ", Result2);
  });

  it("Should be able to create proposal", async function () {
    // Encode call data
    const mockContractInterface = new ethers.utils.Interface(
      MockContractArtifact.abi
    );
    const callDataValuedTran = mockContractInterface.encodeFunctionData(
      "_send",
      [receiver.address, ethers.utils.parseEther("0.1")]
    );

    const txResult = await govContract
      .connect(proposer.signer)
      .propose(
        [receiver.address],
        [ethers.utils.parseEther("0.1")],
        [callDataValuedTran],
        "send 0.1 eth here",
        { gasLimit: 30000000 }
      );

    console.log("Governor created proposal: ", txResult?.hash);
    const Result = await txResult.wait();
    expect(Result.status).to.equal(1);
    await mineBlockAtTimestamp(eta);
  });

  it("Should be able to create proposal", async function () {
    // Mock proposal
    const description = "Mock Proposal";
    const proposal = [[AddressZero], [42], [0xacec0de]];
    const proposalWithDescription = [...proposal, description];

    const txResult = await govContract
      .connect(proposer.signer)
      .propose(...proposalWithDescription, { gasLimit: 30000000 });

    console.log("Governor created proposal: ", txResult?.hash);
    const Result = await txResult.wait();
    expect(Result.status).to.equal(1);
    await mineBlockAtTimestamp(eta);
  });

  it("Should reset harhat server", async function () {
    await hre.network.provider.send("hardhat_reset");
  });
});
