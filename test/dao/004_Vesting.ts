import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { GovernanceToken, Vesting } from '../../typechain-types';

describe('🚩 Testing vesting', async function () {
  // In this test, the dao contracts are deployed
  // Vesting release is tested

  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;
  let acc3: SignerWithAddress;
  let govTokenContract: GovernanceToken;
  let vestingContract: Vesting;
  const vestingAmount = 24000000;

  async function deployRequired() {
    [acc1, acc2, acc3] = await ethers.getSigners();

    const govToken = await ethers.getContractFactory('GovernanceToken');
    govTokenContract = await govToken.deploy();
    await govTokenContract.initialize();

    expect(ethers.utils.isAddress(govTokenContract.address)).to.be.equal(true);

    const vesting = await ethers.getContractFactory('Vesting');
    vestingContract = await vesting.deploy(
      govTokenContract.address,
      acc2.address,
      ethers.utils.parseEther(vestingAmount.toString()),
    );

    await govTokenContract.airdrop(
      [vestingContract.address],
      ethers.utils.parseEther(vestingAmount.toString()),
    );
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Should not be able to withdraw during cliff', async function () {
    await expect(vestingContract.connect(acc2).withdraw()).to.be.revertedWith(
      "You can't withdraw yet",
    );
  });

  it('Should run up EVM', async function () {
    const expiration = 396 * 24 * 60 * 60;
    await time.increase(expiration);
  });

  it('Should be able to vest tokens', async function () {
    await vestingContract.connect(acc2).withdraw();
  });

  it('Should not be able to withdraw more than once per month', async function () {
    await expect(vestingContract.connect(acc2).withdraw()).to.be.revertedWith(
      'Interval violation!',
    );
  });

  it('Should verify that the right amount of tokens vested', async function () {
    const expectedBalance = ethers.utils.parseEther(
      (vestingAmount / 24).toString(),
    );
    const userBalance = await govTokenContract.balanceOf(acc2.address);
    await expect(userBalance).to.equal(expectedBalance);
  });

  it('Should run up EVM', async function () {
    const expiration = 31 * 24 * 60 * 60;
    await time.increase(expiration);
  });

  it('Should be able to vest tokens', async function () {
    await vestingContract.connect(acc2).withdraw();
  });

  it('Should verify that the right amount of tokens vested', async function () {
    const expectedBalance = ethers.utils.parseEther(
      (vestingAmount / 24).toString(),
    );
    const userBalance = await govTokenContract.balanceOf(acc2.address);
    expect(Number(userBalance)).to.equal(Number(expectedBalance) * 2);
  });
});
