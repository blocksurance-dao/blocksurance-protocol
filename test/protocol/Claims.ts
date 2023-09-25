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
  PriceConsumerV3,
  LIQUIDROUTER,
  Collateralizer,
} from '../../typechain-types';

describe('🚩 Testing claims', async function () {
  // In this test, account1 creates position in a pool
  // quote1 is recieved
  // Then account2 mints coverage
  // quote2 is recieved
  // Then account2 mints coverage again
  // quote3 is recieved
  // Then evm time is run up
  // Then claims are triggered
  // Then the LP position is removed
  // Then balances are checked
  // Each quote recieved is higher than the previous quote
  // LP balance after position termination is verified
  // To be equal to original balance - poolfee + quote1 + quote2 - totalCoverage
  // User balance is verified to be equal to original balance - quote1 - quote2 + coverage obtained

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
  let liquidityRouter: LIQUIDROUTER;
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;
  let pool: InsurancePool;
  let quote1: BigNumberish;
  let quote2: BigNumberish;
  // let quote3: BigNumberish;
  let beforeBalanceLP: BigNumberish;
  let beforeBalanceUser: BigNumberish;
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
    // console.log('Liquidity router address:', liquidityAddr);
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
    await usdc.mint(acc2.address, positionAmount);
    await usdc.mint(acc3.address, positionAmount);
    await usdc.mint(acc4.address, positionAmount);
    await usdc.mint(
      collateralizerContract.address,
      (positionAmount * 10) / 100,
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

  it('Should create a position', async function () {
    beforeBalanceLP = await usdc.balanceOf(acc1.address);
    beforeBalanceUser = await usdc.balanceOf(acc2.address);

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
    quote1 = await liquidityRouter.getQuote(
      pool.address,
      ethers.utils.parseUnits(coverageAmount.toString(), 6),
      strike,
    );

    const coverage = await pool
      .connect(acc2)
      .buyCoverage(
        ethers.utils.parseUnits(coverageAmount.toString(), 6),
        strike,
      );
    const txCoverage = await coverage.wait();
    expect(txCoverage.status).to.equal(1);

    await expect(await coverNFT.ownerOf(1)).to.equal(acc2.address);

    quote2 = await liquidityRouter.getQuote(
      pool.address,
      ethers.utils.parseUnits(coverageAmount.toString(), 6),
      strike,
    );

    const coverage2 = await pool
      .connect(acc2)
      .buyCoverage(
        ethers.utils.parseUnits(coverageAmount.toString(), 6),
        strike,
      );
    const txCoverage2 = await coverage2.wait();
    expect(txCoverage2.status).to.equal(1);

    await expect(await coverNFT.ownerOf(2)).to.equal(acc2.address);
  });

  it('Should run up EVM', async function () {
    const runUp = (positionDuration + 1) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should resolve claims', async function () {
    await pool.resolveClaims();
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

  it('Should verify the LP balances are correct', async function () {
    const afterBalanceLP = await usdc.balanceOf(acc1.address);
    const collateral =
      (Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) / 99) *
      collateralizationLevel;

    const reward = (collateral * yieldPercent * positionDuration) / 365;

    const expectedBalanceLP =
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) +
      Number(quote1) +
      Number(quote2) +
      Math.floor(reward) -
      Number(ethers.utils.parseUnits((coverageAmount * 2).toString(), 6));

    expect(Number(expectedBalanceLP)).to.equal(Number(afterBalanceLP));
  });

  it('Should be able to withdraw payouts', async function () {
    expect(await coverNFT.ownerOf(1)).to.equal(acc2.address);
    const withdraw = await pool.connect(acc2).resolveClaim(1);
    const txWithdraw = await withdraw.wait();
    expect(txWithdraw.status).to.equal(1);

    const withdraw2 = await pool.connect(acc2).resolveClaim(2);
    const txWithdraw2 = await withdraw2.wait();
    expect(txWithdraw2.status).to.equal(1);
  });

  it('Should verify claims payout was correct', async function () {
    const afterBalanceLP = await usdc.balanceOf(acc1.address);
    await expect(Number(afterBalanceLP)).to.be.lessThan(
      Number(beforeBalanceLP),
    );

    const afterBalanceUser = await usdc.balanceOf(acc2.address);

    const expectedBalanceUser =
      Number(beforeBalanceUser) -
      Number(quote1) -
      Number(quote2) +
      Number(ethers.utils.parseUnits((coverageAmount * 2).toString(), 6));

    expect(expectedBalanceUser).to.equal(Number(afterBalanceUser));
  });
});
