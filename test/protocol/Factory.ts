import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import {
  ERC20Coin,
  GovernanceToken,
  CoverageManager,
  FACTORY,
  InsurancePool,
  PositionManager,
  USDC,
  LINK,
  PriceConsumerV3,
  LIQUIDROUTER,
  Collateralizer,
} from '../../typechain-types';

describe('🚩 Testing Factory', async function () {
  let coinContract: ERC20Coin;
  let usdc: USDC;
  let link: LINK;

  let factory: FACTORY;
  let coverNFT: CoverageManager;
  let positionNFT: PositionManager;
  let pool: InsurancePool;
  let oracleContract: PriceConsumerV3;
  let liquidityRouter: LIQUIDROUTER;
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;

  const imageURL =
    'https://ipfs.io/ipfs/QmUSWtPrxDVmxt2egdErZsD7AXmFbUBQbfPpEoh1jTYXNu';

  async function deployRequired() {
    const USDC = await ethers.getContractFactory('USDC');
    usdc = await USDC.deploy();
    await usdc.deployed();

    const LINK = await ethers.getContractFactory('LINK');
    link = await LINK.deploy();
    await link.deployed();

    const ORACLE = await ethers.getContractFactory('PriceConsumerV3');
    oracleContract = await ORACLE.deploy();

    const NFTcover = await ethers.getContractFactory('CoverageManager');
    coverNFT = await NFTcover.deploy();
    await coverNFT.deployed();

    const NFTposition = await ethers.getContractFactory('PositionManager');
    positionNFT = await NFTposition.deploy();
    await coverNFT.deployed();

    const FACTORY = await ethers.getContractFactory('FACTORY');
    factory = await FACTORY.deploy();
    await factory.deployed();

    const govToken = await ethers.getContractFactory('GovernanceToken');
    govTokenContract = await govToken.deploy();
    await govTokenContract.initialize();
    const collateralizer = await ethers.getContractFactory('Collateralizer');
    collateralizerContract = await collateralizer.deploy(usdc.address);

    const liquidity = await ethers.getContractFactory('LIQUIDROUTER');

    liquidityRouter = await liquidity.deploy(
      factory.address,
      usdc.address,
      positionNFT.address,
      collateralizerContract.address,
    );

    await collateralizerContract.setRouter(liquidityRouter.address);

    await factory.initialize(
      usdc.address,
      coverNFT.address,
      liquidityRouter.address,
    );

    await coverNFT.setFactory(factory.address);
    await positionNFT.setFactory(factory.address);

    await factory.listToken(
      'Chainlink',
      'LINK',
      link.address,
      '0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82',
      'https://ipfs.io/ipfs/QmUSWtPrxDVmxt2egdErZsD7AXmFbUBQbfPpEoh1jTYXNu',
    );

    const Result = await factory.createPool(
      //token, base, premium, minPositionDuration
      link.address,
      usdc.address,
      40,
      180,
    );

    const txResult = await Result.wait();
    expect(txResult.status).to.equal(1);
    const poolAddress = await factory.pools(link.address, 0);

    const POOL = await ethers.getContractFactory('InsurancePool');
    pool = await POOL.attach(poolAddress);
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Sending eth to factory should revert', async function () {
    const [owner] = await ethers.getSigners();
    await expect(
      owner.sendTransaction({
        to: factory.address,
        value: ethers.utils.parseEther('10.0'),
      }),
    ).to.be.reverted;
  });

  describe('🚩 Factory whitelisting', function () {
    it('Should deploy ERC20Coin', async function () {
      const Coin = await ethers.getContractFactory('ERC20Coin');
      coinContract = await Coin.deploy(
        'iSURE',
        'SAFE',
        ethers.utils.parseEther('1000000'),
      );
    });

    it('Should add tokens to whitelist', async function () {
      const wlResult = await factory.listToken(
        'iSHURE',
        'SAFE',
        coinContract.address,
        oracleContract.address,
        imageURL,
      );

      const txResult = await wlResult.wait();
      expect(txResult.status).to.equal(1);
    });

    it('Should add another token to whitelist', async function () {
      const Coin = await ethers.getContractFactory('ERC20Coin');
      const newContract = await Coin.deploy(
        'Alchemy',
        'ALCH',
        ethers.utils.parseEther('1000000'),
      );

      const wlResult = await factory.listToken(
        'Alchemy',
        'ALCH',
        newContract.address,
        oracleContract.address,
        imageURL,
      );

      const txResult = await wlResult.wait();
      expect(txResult.status).to.equal(1);

      const token = await factory.getToken(newContract.address);
      expect(token.name).to.equal('Alchemy');
    });

    it('Should add another token to whitelist', async function () {
      const ORACLE_ADDRESS1 = '0x9bd03768a7DCc129555dE410FF8E85528A4F88b5';

      await expect(
        factory.listToken(
          'Chainlink',
          'LINK',
          link.address,
          ORACLE_ADDRESS1,
          imageURL,
        ),
      ).to.be.revertedWith('Token Exists!');
    });

    it('Should retrieve token listing from contract', async function () {
      const tokenArray = await factory.getListings();
      expect(tokenArray.length).to.equal(3);
    });

    it('Should delete token from contract', async function () {
      const rtResult = await factory.removeToken(coinContract.address);

      const txResult = await rtResult.wait();
      expect(txResult.status).to.equal(1);

      const glResult = await factory.getListings();

      expect(glResult.length).to.equal(2);
    });
  });

  describe('🚩 Factory Pools', function () {
    it('Should be able to retrieve pools', async function () {
      const pools = await factory.getPools(link.address);

      expect(pools[0]).to.equal(pool.address);
    });

    it('Should be able to pause pools', async function () {
      const isBefore = await factory.paused(pool.address);
      expect(isBefore).to.equal(false);
      await factory.pausePool(pool.address);

      const isAfter = await factory.paused(pool.address);
      expect(isAfter).to.equal(true);
    });
  });
});
