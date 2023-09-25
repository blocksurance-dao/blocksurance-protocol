import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import { FACTORY, LINK, PriceConsumerV3 } from '../../../typechain-types';

describe('🚩 Testing blockGasLimit4, Factory Token Listings', async function () {
  // In this test, 2000 tokens a whitelisted and then the last token removed

  this.timeout(500000);

  let tokenContract: LINK;
  let factory: FACTORY;
  let oracleContract: PriceConsumerV3;

  const numTokens = 2000;

  async function deployRequired() {
    const FACTORY = await ethers.getContractFactory('FACTORY');
    factory = await FACTORY.deploy();

    await factory.deployed();

    const ORACLE = await ethers.getContractFactory('PriceConsumerV3');
    oracleContract = await ORACLE.deploy();
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Should list token 2000 times', async function () {
    for (let i = 0; i < numTokens; i++) {
      const token = await ethers.getContractFactory('LINK');
      tokenContract = await token.deploy();
      await tokenContract.deployed();
      await factory.listToken(
        'NAME' + i.toString(),
        'SYMBOL' + i.toString(),
        tokenContract.address,
        oracleContract.address,
        'https://ipfs.io/ipfs/QmUSWtPrxDVmxt2egdErZsD7AXmFbUBQbfPpEoh1jTYXNu',
      );
    }
  });

  it('Should remove last token listing', async function () {
    await factory.removeToken(tokenContract.address);
  });

  it('Should retrieve token listing from contract', async function () {
    const tokenArray = await factory.getListings();
    expect(tokenArray.length).to.equal(1999);
  });
});
