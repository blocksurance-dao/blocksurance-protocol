import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import {
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
} from '../../../typechain-types';

describe('🚩 Testing blockGasLimit3 Stress Test', async function () {
  // In this test, account1 creates position in a pool
  // Then account2 mints coverage 400 times with strike 10
  // Then account2 mints coverage 400 times with strike 40
  // Then the evm time is run up
  // The performUpkeep is performed on the pool
  // On various price setting (must augment price inside the performUpkeep)
  // Showing the ability to service 800 customers per pool
  // Ability to resolve 800 claims or expirations simultaneously

  this.timeout(500000);
  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;
  let acc3: SignerWithAddress;
  let usdc: USDC;
  let link: LINK;

  let factory: FACTORY;
  let coverNFT: CoverageManager;
  let positionNFT: PositionManager;
  let oracleContract: PriceConsumerV3;
  let pool: InsurancePool;
  let liquidityRouter: LIQUIDROUTER;
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;
  const routerRole =
    '0x7a05a596cb0ce7fdea8a1e1ec73be300bdb35097c944ce1897202f7a13122eb2';

  const liquidatorRole =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

  const strike = 40;
  const premium = 20;
  const coverageAmount = 2000;
  const numTransactions = 800;
  const positionDuration = 366;
  const positionAmount = 2000000;

  async function deployRequired() {
    [acc1, acc2, acc3] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory('USDC');
    usdc = await USDC.deploy();
    await usdc.deployed();

    const LINK = await ethers.getContractFactory('LINK');
    link = await LINK.deploy();
    await link.deployed();

    const NFTcover = await ethers.getContractFactory('CoverageManager');
    coverNFT = await NFTcover.deploy();
    await coverNFT.deployed();

    const NFTposition = await ethers.getContractFactory('PositionManager');
    positionNFT = await NFTposition.deploy();
    await positionNFT.deployed();

    const FACTORY = await ethers.getContractFactory('FACTORY');
    factory = await FACTORY.deploy();

    await factory.deployed();

    const ORACLE = await ethers.getContractFactory('PriceConsumerV3');
    oracleContract = await ORACLE.deploy();

    await factory.listToken(
      'Chainlink',
      'LINK',
      link.address,
      oracleContract.address,
      'https://ipfs.io/ipfs/QmUSWtPrxDVmxt2egdErZsD7AXmFbUBQbfPpEoh1jTYXNu',
    );

    await factory.setParams(
      ethers.utils.parseUnits('5', 18),
      ethers.utils.parseUnits(positionAmount.toString(), 6),
    );
    await coverNFT.setFactory(factory.address);
    await positionNFT.setFactory(factory.address);

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
    await collateralizerContract.grantRole(routerRole, liquidityRouter.address);
    await collateralizerContract.grantRole(liquidatorRole, acc1.address);

    await factory.initialize(
      usdc.address,
      coverNFT.address,
      liquidityRouter.address,
    );

    const Result = await factory.createPool(
      //token, base, premium, minPositionDuration
      link.address,
      usdc.address,
      premium,
      positionDuration,
    );

    const txResult = await Result.wait();
    expect(txResult.status).to.equal(1);
    const poolAddress = await factory.pools(link.address, 0);

    const POOL = await ethers.getContractFactory('InsurancePool');
    pool = await POOL.attach(poolAddress);

    expect(await pool.maxPoolSize()).to.equal(
      ethers.utils.parseUnits(positionAmount.toString(), 6),
    );
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Should approve USDC transfers for participants', async function () {
    await usdc.mint(acc1.address, positionAmount);
    await usdc.mint(acc2.address, positionAmount);
    await usdc.mint(acc3.address, positionAmount);
    await usdc.mint(
      collateralizerContract.address,
      (positionAmount * 20) / 100,
    );

    const approve1 = await usdc
      .connect(acc1)
      .approve(
        liquidityRouter.address,
        ethers.utils.parseUnits(positionAmount.toString(), 6),
      );
    expect(approve1.confirmations).to.equal(1);
    const approve2 = await usdc
      .connect(acc2)
      .approve(
        pool.address,
        ethers.utils.parseUnits(positionAmount.toString(), 6),
      );
    expect(approve2.confirmations).to.equal(1);
    const approve3 = await usdc
      .connect(acc3)
      .approve(
        pool.address,
        ethers.utils.parseUnits(positionAmount.toString(), 6),
      );
    expect(approve3.confirmations).to.equal(1);
  });

  it('Should create a position', async function () {
    const position = await liquidityRouter.createPosition(
      pool.address,
      ethers.utils.parseUnits(positionAmount.toString(), 6),
      positionDuration,
    );

    const txPosition = await position.wait();
    expect(txPosition.status).to.equal(1);
    await expect(liquidityRouter.removePosition(1)).to.be.revertedWith(
      'Position active!',
    );
  });

  it('Should obtain coverage, strike 10', async function () {
    for (let i = 0; i < numTransactions / 2; i++) {
      const coverage = await pool
        .connect(acc3)
        .buyCoverage(ethers.utils.parseUnits(coverageAmount.toString(), 6), 10);
      const txCoverage = await coverage.wait();
      expect(txCoverage.status).to.equal(1);
    }

    await expect(await coverNFT.ownerOf(1)).to.equal(acc3.address);
    await expect(await coverNFT.ownerOf(100)).to.equal(acc3.address);
  });

  it('Should obtain coverage, strike 40', async function () {
    for (let i = 0; i < numTransactions / 2; i++) {
      const coverage = await pool
        .connect(acc2)
        .buyCoverage(
          ethers.utils.parseUnits(coverageAmount.toString(), 6),
          strike,
        );
      const txCoverage = await coverage.wait();
      expect(txCoverage.status).to.equal(1);
    }
  });

  it('Should run up EVM', async function () {
    const expiration = (positionDuration + 1) * 24 * 60 * 60;
    await time.increase(expiration);
  });

  it('Should perform Chainlink Upkeep on a Pool', async function () {
    const upkeep = await pool.checkUpkeep('0x00');
    expect(upkeep[0]).to.equal(true);
    const keeper = await pool.performUpkeep('0x00');
    const txKeeper = await keeper.wait();
    expect(txKeeper.status).to.equal(1);
  });

  it('Should run up EVM', async function () {
    const expiration = (positionDuration + 1) * 24 * 60 * 60;
    await time.increase(expiration);
  });

  it('Should resolve expirations', async function () {
    await pool.resolveClaims();
    await pool.resolveExpirations();
  });

  it('Should remove position', async function () {
    await collateralizerContract.liquidatePosition(1);
    await collateralizerContract.processQue();

    const remove = await liquidityRouter.removePosition(1);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);

    await expect(positionNFT.ownerOf(1)).to.be.revertedWith(
      'ERC721: invalid token ID',
    );
  });

  it('Should check free liquidity', async function () {
    expect(await liquidityRouter.freeLiquidity(pool.address)).to.equal(0);
  });
});
