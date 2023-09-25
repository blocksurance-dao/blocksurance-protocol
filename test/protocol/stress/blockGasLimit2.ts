import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
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

describe('🚩 Testing blockGasLimit2 expirations', async function () {
  // In this test, account1 creates position in a pool
  // Then account2 mints coverage 300 times
  // Then the evm time is run up
  // The the pool expirations are triggered
  // Position is removed, balances are checked
  // simulating what would happen over a lifespan of a position
  // if no claim was triggered
  // Then position2 is opened
  // Another account aquires coverage 300 times
  // expirations are triggered
  // position is removed
  // Liquidity router balance is checked for 0 residual balance
  this.timeout(65000);
  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;
  let acc3: SignerWithAddress;
  let acc4: SignerWithAddress;
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

  const poolFee = 0.01;
  const strike = 10;
  const premium = 25;
  const coverageAmount = 3000;
  const numTransactions = 300;
  const positionDuration = 366;
  const positionAmount = 1000000;
  const expectedLiquidity = positionAmount - positionAmount * poolFee;
  const yieldPercent = 0.04;
  const collateralizationLevel = 94;

  async function deployRequired() {
    [acc1, acc2, acc3, acc4] = await ethers.getSigners();

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

    const ORACLE = await ethers.getContractFactory('PriceConsumerV3');
    oracleContract = await ORACLE.deploy();

    await factory.listToken(
      'Chainlink',
      'LINK',
      link.address,
      oracleContract.address,
      'https://ipfs.io/ipfs/QmUSWtPrxDVmxt2egdErZsD7AXmFbUBQbfPpEoh1jTYXNu',
    );

    await coverNFT.setFactory(factory.address);
    await positionNFT.setFactory(factory.address);

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
  }

  it('Should deploy the contracts', async function () {
    await hre.network.provider.send('hardhat_reset');
    await loadFixture(deployRequired);
  });

  it('Should approve USDC transfers for participants', async function () {
    await usdc.mint(acc1.address, positionAmount);
    await usdc.mint(acc2.address, positionAmount * 2);
    await usdc.drip(acc3.address);
    await usdc.drip(acc4.address);
    await usdc.mint(
      collateralizerContract.address,
      (positionAmount * 20) / 100,
    );

    const approve1 = await usdc
      .connect(acc1)
      .approve(
        liquidityRouter.address,
        ethers.utils.parseUnits((positionAmount * 3).toString(), 6),
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
        ethers.utils.parseUnits((positionAmount * 3).toString(), 6),
      );
    expect(approve3.confirmations).to.equal(1);
    const approve4 = await usdc
      .connect(acc4)
      .approve(
        pool.address,
        ethers.utils.parseUnits((positionAmount * 3).toString(), 6),
      );
    expect(approve4.confirmations).to.equal(1);
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

  it('Should obtain coverage', async function () {
    for (let i = 0; i < numTransactions; i++) {
      const coverage = await pool
        .connect(acc2)
        .buyCoverage(
          ethers.utils.parseUnits(coverageAmount.toString(), 6),
          strike,
        );
      const txCoverage = await coverage.wait();
      expect(txCoverage.status).to.equal(1);
    }

    await expect(await coverNFT.ownerOf(1)).to.equal(acc2.address);
    await expect(await coverNFT.ownerOf(100)).to.equal(acc2.address);
  });

  it('Should run up EVM', async function () {
    const runUp = (positionDuration + 2) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations', async function () {
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

  it('Should verify the LP balance is correct', async function () {
    const afterBalanceLP = await usdc.balanceOf(acc1.address);

    const collateral =
      (Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) / 99) *
      collateralizationLevel;

    const reward = (collateral * yieldPercent * positionDuration) / 365;

    const expectedBalanceLP =
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) +
      (Number(ethers.utils.parseUnits(coverageAmount.toString(), 6)) *
        premium *
        numTransactions) /
        1000 +
      Math.floor(reward);

    expect(Number(expectedBalanceLP)).to.equal(Number(afterBalanceLP));
  });

  it('Should create a position', async function () {
    const position = await liquidityRouter.createPosition(
      pool.address,
      ethers.utils.parseUnits(positionAmount.toString(), 6),
      positionDuration + 1,
    );

    const txPosition = await position.wait();
    expect(txPosition.status).to.equal(1);
    await expect(liquidityRouter.removePosition(2)).to.be.revertedWith(
      'Position active!',
    );
  });

  it('Should obtain coverage', async function () {
    for (let i = 0; i < numTransactions; i++) {
      const coverage = await pool
        .connect(acc2)
        .buyCoverage(
          ethers.utils.parseUnits(coverageAmount.toString(), 6),
          strike,
        );
      const txCoverage = await coverage.wait();
      expect(txCoverage.status).to.equal(1);
    }

    await expect(await coverNFT.ownerOf(1)).to.equal(acc2.address);
    await expect(await coverNFT.ownerOf(100)).to.equal(acc2.address);
  });

  it('Should run up EVM', async function () {
    const runUp = (positionDuration + 2) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations', async function () {
    await pool.resolveExpirations();
  });

  it('Should run up EVM', async function () {
    const runUp = 14400; //4 hours
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations', async function () {
    await pool.resolveExpirations();
  });

  it('Should run up EVM', async function () {
    const runUp = 14400; //4 hours
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations', async function () {
    await pool.resolveExpirations();
  });

  it('Should run up EVM', async function () {
    const runUp = 14400; //4 hours
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations', async function () {
    await pool.resolveExpirations();
  });

  it('Should run up EVM', async function () {
    const runUp = 14400; //4 hours
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations', async function () {
    await pool.resolveExpirations();
  });

  it('Should remove position', async function () {
    await collateralizerContract.liquidatePosition(2);
    await collateralizerContract.processQue();

    const remove = await liquidityRouter.removePosition(2);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);

    await expect(positionNFT.ownerOf(2)).to.be.revertedWith(
      'ERC721: invalid token ID',
    );
  });

  it('Should check free liquidity', async function () {
    expect(await liquidityRouter.freeLiquidity(pool.address)).to.equal(0);
  });
});
