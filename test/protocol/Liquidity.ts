import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { BigNumberish } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';

import {
  GovernanceToken,
  CoverageManager,
  FACTORY,
  InsurancePool,
  PositionManager,
  USDC,
  LINK,
  LIQUIDROUTER,
  Collateralizer,
} from '../../typechain-types';

describe('🚩 Testing liquidity', async function () {
  // In this test, account1 creates position1 in a pool
  // Then account2 creates a different position2 in a pool
  // Then account3 mints coverage with position1 as counterparty
  // Then account4 mints coverage with position2 as counterparty
  // This shows that the AMM is working properly
  // Then evm time is run up to expire position1
  // Then expirations are triggered
  // Then the LP position1 is removed
  // Then balances are checked
  // Then evm time is run up to expire position2
  // Then the LP position2 is removed
  // Then balances are checked

  let acc1: SignerWithAddress;
  let acc2: SignerWithAddress;
  let acc3: SignerWithAddress;
  let acc4: SignerWithAddress;
  let usdc: USDC;
  let link: LINK;

  let factory: FACTORY;
  let coverNFT: CoverageManager;
  let positionNFT: PositionManager;
  let pool: InsurancePool;
  let liquidityRouter: LIQUIDROUTER;
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;
  let quote1: BigNumberish;
  let quote2: BigNumberish;
  const routerRole =
    '0x7a05a596cb0ce7fdea8a1e1ec73be300bdb35097c944ce1897202f7a13122eb2';

  const liquidatorRole =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

  const poolFee = 0.01;
  const positionAmount = 20000;
  const expectedLiquidity = positionAmount - positionAmount * poolFee;
  const coverageAmount = positionAmount / 4;
  const positionDuration = 366;
  const strike = 10;
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

    const liquidity = await ethers.getContractFactory('LIQUIDROUTER');
    const govToken = await ethers.getContractFactory('GovernanceToken');
    govTokenContract = await govToken.deploy();
    await govTokenContract.initialize();
    const collateralizer = await ethers.getContractFactory('Collateralizer');
    collateralizerContract = await collateralizer.deploy(usdc.address);

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
    const oracleContract = await ORACLE.deploy();

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
      // 10,
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

  it('Should approve USDC transfers for participants', async function () {
    await usdc.mint(acc1.address, positionAmount);
    await usdc.mint(acc2.address, positionAmount * 2);
    await usdc.mint(acc3.address, positionAmount);
    await usdc.mint(acc4.address, positionAmount);
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
        liquidityRouter.address,
        ethers.utils.parseUnits((positionAmount * 3).toString(), 6),
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

  it('Should create two positions with different expirations', async function () {
    const position1 = await liquidityRouter
      .connect(acc1)
      .createPosition(
        pool.address,
        ethers.utils.parseUnits(positionAmount.toString(), 6),
        positionDuration,
      );
    const txPosition1 = await position1.wait();
    expect(txPosition1.status).to.equal(1);

    const position2 = await liquidityRouter
      .connect(acc2)
      .createPosition(
        pool.address,
        ethers.utils.parseUnits((positionAmount * 2).toString(), 6),
        positionDuration * 2,
      );
    const txPosition2 = await position2.wait();
    expect(txPosition2.status).to.equal(1);
  });

  it('Should check that the position nft were minted right', async function () {
    expect(await positionNFT.ownerOf(1)).to.equal(acc1.address);
    expect(await positionNFT.ownerOf(2)).to.equal(acc2.address);
    await expect(liquidityRouter.removePosition(1)).to.be.revertedWith(
      'Position active!',
    );
    await expect(
      liquidityRouter.connect(acc2).removePosition(2),
    ).to.be.revertedWith('Position active!');
  });

  it('Should be able to mint coverage', async function () {
    quote1 = await liquidityRouter.getQuote(
      pool.address,
      ethers.utils.parseUnits(coverageAmount.toString(), 6),
      strike,
    );
    const coverage1 = await pool
      .connect(acc3)
      .buyCoverage(
        ethers.utils.parseUnits(coverageAmount.toString(), 6),
        strike,
      );
    const txCoverage1 = await coverage1.wait();
    expect(txCoverage1.status).to.equal(1);

    await expect(await coverNFT.ownerOf(1)).to.equal(acc3.address);

    quote2 = await liquidityRouter.getQuote(
      pool.address,
      ethers.utils.parseUnits((coverageAmount * 4).toString(), 6),
      strike * 3,
    );
    const coverage2 = await pool
      .connect(acc4)
      .buyCoverage(
        ethers.utils.parseUnits((coverageAmount * 4).toString(), 6),
        strike * 3,
      );
    const txCoverage2 = await coverage2.wait();
    expect(txCoverage2.status).to.equal(1);

    await expect(await coverNFT.ownerOf(2)).to.equal(acc4.address);
  });

  it('Should verify position integrity', async function () {
    const pos = await liquidityRouter.getPosition(1);

    expect(pos[0]).to.equal(1);
    expect(Number(pos[1])).to.equal(
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)),
    );
    expect(pos[1]).to.be.greaterThan(pos[2]);
  });

  it('Should run up the timer on EVM', async function () {
    const runUp = (positionDuration + 1) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve expirations on coverage', async function () {
    await pool.resolveExpirations();
  });

  it('Should remove position successfully', async function () {
    await collateralizerContract.liquidatePosition(1);
    await collateralizerContract.processQue();

    const remove = await liquidityRouter.connect(acc1).removePosition(1);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);
  });

  it('Should verify the balances are correct', async function () {
    const afterBalanceLP = await usdc.balanceOf(acc1.address);

    const collateral =
      (Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) / 99) *
      collateralizationLevel;

    const reward = (collateral * yieldPercent * positionDuration) / 365;

    const expectedBalanceLP =
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) +
      Number(quote1) +
      Math.floor(reward);

    expect(Number(expectedBalanceLP)).to.equal(Number(afterBalanceLP));
  });

  it('Should run up the timer on EVM', async function () {
    const runUp = (positionDuration + 1) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should remove position successfully', async function () {
    await collateralizerContract.liquidatePosition(2);
    await collateralizerContract.processQue();

    const remove = await liquidityRouter.connect(acc2).removePosition(2);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);
  });

  it('Should verify the balances are correct', async function () {
    const afterBalanceLP = await usdc.balanceOf(acc2.address);
    const collateral =
      (Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) / 99) *
      collateralizationLevel;

    const reward =
      (collateral * 2 * yieldPercent * (positionDuration * 2)) / 365;

    const expectedBalanceLP =
      Number(ethers.utils.parseUnits((expectedLiquidity * 2).toString(), 6)) +
      Number(quote2) +
      Math.floor(reward);

    expect(Number(expectedBalanceLP)).to.equal(Number(afterBalanceLP));
  });
});
