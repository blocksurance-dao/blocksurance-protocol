import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { GovernanceToken } from '../../typechain-types';

describe('🚩 Testing ability to burn tokens', async function () {
  // In this test, the dao contracts are deployed
  // Burning functionality is tested

  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;
  let acc3: SignerWithAddress;
  let govTokenContract: GovernanceToken;
  const burnAmount = 50000000;
  const totalSupply = 5000000000;

  async function deployRequired() {
    [acc1, acc2, acc3] = await ethers.getSigners();

    const govToken = await ethers.getContractFactory('GovernanceToken');
    govTokenContract = await govToken.deploy();
    await govTokenContract.initialize();

    expect(ethers.utils.isAddress(govTokenContract.address)).to.be.equal(true);

    await govTokenContract.airdrop(
      [acc1.address, acc2.address, acc3.address],
      ethers.utils.parseEther(burnAmount.toString()),
    );
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Should be able to burn tokens', async function () {
    await govTokenContract.burn(ethers.utils.parseEther(burnAmount.toString()));
  });

  it('Should verify that the BLK totalSupply after burning', async function () {
    const balance = totalSupply - burnAmount;
    await expect(await govTokenContract.totalSupply()).to.equal(
      ethers.utils.parseEther(balance.toString()),
    );
  });
});
