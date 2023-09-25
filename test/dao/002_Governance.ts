import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { mine, loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { GovTimelockController } from '../../typechain-types/contracts/dao/TimelockController.sol';

import { BlocksuranceGovernor, GovernanceToken } from '../../typechain-types';

describe('🚩 Testing governance', async function () {
  // In this test, the dao contracts are deployed
  // Coin and Gov Token are deployed
  // Timelock is deployed
  // Governor is deployed
  // Governor initialized
  // Timelock initialized
  // BLK tokens are airdropped to 3 accounts and the Treasury
  // Check that the Governor has the right roles in the Timelock
  // 3 accounts stake BLK and recieve Governance Tokens
  // 3 accounts delegate votes to self
  // Create proposal to transfer BLK tokens from Treasury to account #4
  // 3 accounts cast their votes for the proposal
  // Proposal succeeds and is qued
  // Proposal is executed successfully
  // Balance of account #4 is checked to verify the transfer from the Treasury
  // Balance of the Treasury is checked to verify the correct transfer
  // Staking functionality is tested

  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;
  let acc3: SignerWithAddress;
  let acc4: SignerWithAddress;

  let govTokenContract: GovernanceToken;
  let governorContract: BlocksuranceGovernor;
  let timelockContract: GovTimelockController;

  const stakeAmount = 20000000;
  const _durationDays = 90;
  const timelockDelay = 2; // seconds
  let proposalId: BigNumberish;

  const proposerRole =
    '0xb09aa5aeb3702cfd50b6b62bc4532604938f21248a27a1d5ca736082b6819cc1';
  const executorRole =
    '0xd8aa0f3194971a2a116679f7c2090f6939c8d4e01a2a8d7e41d55e5351469e63';
  // const cancellerRole = '0xebfdca8e46c0b8dacf9989ee613e35727eadd20a1d5e5ad01a53968c7e5fe07a';
  // const timelockAdmin = '0x5f58e3a2316349923ce3780f8d587db2d72378aed66a8261c916544fa6846ca5';

  async function deployRequired() {
    [acc1, acc2, acc3, acc4] = await ethers.getSigners();

    const govToken = await ethers.getContractFactory('GovernanceToken');
    govTokenContract = await govToken.deploy();
    await govTokenContract.initialize();

    expect(ethers.utils.isAddress(govTokenContract.address)).to.be.equal(true);

    const contract = await ethers.getContractFactory('GovTimelockController');
    timelockContract = await contract.deploy();
    expect(ethers.utils.isAddress(timelockContract.address)).to.be.equal(true);

    const governor = await ethers.getContractFactory('BlocksuranceGovernor');
    governorContract = await governor.deploy();
    expect(ethers.utils.isAddress(governorContract.address)).to.be.equal(true);

    await governorContract.initialize(
      govTokenContract.address,
      timelockContract.address,
    );

    await timelockContract.initialize(
      timelockDelay,
      [governorContract.address],
      [governorContract.address],
      acc1.address,
    );

    await govTokenContract.airdrop(
      [timelockContract.address, acc1.address, acc2.address, acc3.address],
      ethers.utils.parseEther(stakeAmount.toString()),
    );

    await govTokenContract
      .connect(acc1)
      .approve(
        govTokenContract.address,
        ethers.utils.parseEther(stakeAmount.toString()),
      );

    await govTokenContract
      .connect(acc2)
      .approve(
        govTokenContract.address,
        ethers.utils.parseEther(stakeAmount.toString()),
      );

    await govTokenContract
      .connect(acc3)
      .approve(
        govTokenContract.address,
        ethers.utils.parseEther(stakeAmount.toString()),
      );
  }

  async function StakeRequired() {
    //stake 1
    const stakeResult = await govTokenContract
      .connect(acc1)
      .stakeTokens(
        ethers.utils.parseEther(stakeAmount.toString()),
        _durationDays,
      );

    const txResult = await stakeResult.wait();
    expect(txResult.status).to.equal(1);

    const endingStake = await govTokenContract.getUserStake(acc1.address);

    expect(endingStake.amount).to.equal(
      ethers.utils.parseEther(stakeAmount.toString()),
    );
    //stake 2
    const stakeResult2 = await govTokenContract
      .connect(acc2)
      .stakeTokens(
        ethers.utils.parseEther(stakeAmount.toString()),
        _durationDays,
      );

    const txResult2 = await stakeResult2.wait();
    expect(txResult2.status).to.equal(1);
    //stake 3
    const stakeResult3 = await govTokenContract
      .connect(acc3)
      .stakeTokens(
        ethers.utils.parseEther(stakeAmount.toString()),
        _durationDays,
      );

    const txResult3 = await stakeResult3.wait();
    expect(txResult3.status).to.equal(1);
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Should check if the executor role belongs to Governor', async function () {
    const Result = await timelockContract.hasRole(
      executorRole,
      governorContract.address,
    );

    expect(Result).to.equal(true);
  });

  it('Should check if the proposer role belongs to Governor', async function () {
    const Result = await timelockContract.hasRole(
      proposerRole,
      governorContract.address,
    );

    expect(Result).to.equal(true);
  });

  it('Should be able to delegate vote', async function () {
    const delegate = await govTokenContract
      .connect(acc1)
      .delegate(acc1.address);

    const Result = await delegate.wait();
    expect(Result.status).to.equal(1);
  });

  it('Should be able to delegate vote', async function () {
    const delegate = await govTokenContract
      .connect(acc2)
      .delegate(acc2.address);

    const Result = await delegate.wait();
    expect(Result.status).to.equal(1);
  });

  it('Should be able to delegate vote', async function () {
    const delegate = await govTokenContract
      .connect(acc3)
      .delegate(acc3.address);

    const Result = await delegate.wait();
    expect(Result.status).to.equal(1);
  });

  it('Should be able to create proposal', async function () {
    // Encode call data
    const callDataValuedTran = govTokenContract.interface.encodeFunctionData(
      'transfer',
      [acc4.address, ethers.utils.parseEther('1')],
    );

    const txResult = await governorContract
      .connect(acc1)
      .propose(
        [govTokenContract.address],
        [0],
        [callDataValuedTran],
        'Proposal #1: send 1 token here',
      );

    const Result = await txResult.wait(1);
    expect(Result.status).to.equal(1);

    proposalId = Result?.events[0].args.proposalId;

    const state = await governorContract.state(proposalId);
  });

  it('Should be able to cast vote', async function () {
    await mine(2);

    const state = await governorContract.state(proposalId);
    // console.log('state before cast vote', state);
    expect(state).to.equal(1);

    const txResult = await governorContract
      .connect(acc1)
      .castVote(proposalId, 1);

    const Result = await txResult.wait(1);

    expect(Result?.events[0].args.weight).to.equal(
      ethers.utils.parseEther(stakeAmount.toString()),
    );

    const txResult2 = await governorContract
      .connect(acc2)
      .castVote(proposalId, 1); //one is for

    const Result2 = await txResult2.wait(1);

    const txResult3 = await governorContract
      .connect(acc3)
      .castVote(proposalId, 1); //one is for

    await txResult3.wait(1);
  });

  it('Should be able to que proposal', async function () {
    await mine(47);
    // state = 4 = succeded || state = 3 = defeated || state = 1 = active || state = 5 = qued
    expect(await governorContract.state(proposalId)).to.equal(4); //succeded
    const supply = await govTokenContract.totalSupply();

    const state = await governorContract.state(proposalId);
    // console.log('state after cast vote', state);

    const callDataValuedTran = govTokenContract.interface.encodeFunctionData(
      'transfer',
      [acc4.address, ethers.utils.parseEther('1')],
    );

    const descriptionHash = ethers.utils.id('Proposal #1: send 1 token here');
    const votes = await governorContract.proposalVotes(proposalId);

    await governorContract.queue(
      [govTokenContract.address],
      [0],
      [callDataValuedTran],
      descriptionHash,
    );
  });

  it('Should be able to execute proposal', async function () {
    await mine(1);

    const state = await governorContract.state(proposalId);
    // console.log('state after qued proposal: ', state);
    expect(state).to.equal(5); //qued

    const callDataValuedTran = govTokenContract.interface.encodeFunctionData(
      'transfer',
      [acc4.address, ethers.utils.parseEther('1')],
    );

    const descriptionHash = ethers.utils.id('Proposal #1: send 1 token here');

    await governorContract.execute(
      [govTokenContract.address],
      [0],
      [callDataValuedTran],
      descriptionHash,
    );
    expect(await governorContract.state(proposalId)).to.equal(7);
  });

  it('Should verify that the balance of acc4 contains 1 BLK token', async function () {
    await expect(await govTokenContract.balanceOf(acc4.address)).to.equal(
      ethers.utils.parseEther('1'),
    );
  });

  it('Should verify that the Treasury balance lost 1 BLK token', async function () {
    await expect(
      await govTokenContract.balanceOf(timelockContract.address),
    ).to.equal(ethers.utils.parseEther((stakeAmount - 1).toString()));
  });

  it('Should stake BLK from 4 accounts', async function () {
    await loadFixture(StakeRequired);
  });
});
