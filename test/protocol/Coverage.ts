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

describe('🚩 Testing coverage', async function () {
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
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;
  let pool: InsurancePool;
  let liquidityRouter: LIQUIDROUTER;
  let beforeBalanceLP: BigNumberish;
  let beforeBalanceUser: BigNumberish;
  const routerRole =
    '0x7a05a596cb0ce7fdea8a1e1ec73be300bdb35097c944ce1897202f7a13122eb2';

  const liquidatorRole =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

  const strike = 10;
  const positionAmount = 20000;
  const coverageAmount = positionAmount / 4;
  const positionDuration = 366;

  async function deployRequired() {
    // Contracts are deployed using the first signer/account by default
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
    // console.log('Pool deployed:', pool.address);
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
        liquidityRouter.address,
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

  it('After expiration transactions should be settled', async function () {
    // In this test, account1 creates position in a pool
    // Then account2 mints coverage
    // Then evm time is run up
    // Then a expiration is triggered
    // Then the LP position is removed
    // Then balances are checked

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

    const beforeBalanceLP = await usdc.balanceOf(acc1.address);
    const beforeBalanceUser = await usdc.balanceOf(acc2.address);

    const approveOther = await usdc
      .connect(acc2)
      .approve(pool.address, ethers.utils.parseUnits('2000', 6));
    expect(approveOther.confirmations).to.equal(1);

    const coverage = await pool
      .connect(acc2)
      .buyCoverage(
        ethers.utils.parseUnits(coverageAmount.toString(), 6),
        strike,
      );
    const txCoverage = await coverage.wait();
    expect(txCoverage.status).to.equal(1);

    await expect(await coverNFT.ownerOf(1)).to.equal(acc2.address);

    const runUp = (positionDuration + 2) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp + 14400]);
    await ethers.provider.send('evm_mine', []);

    await pool.resolveExpirations();

    const liquidate = await collateralizerContract.liquidatePosition(1);
    const que = await collateralizerContract.processQue();

    const remove = await liquidityRouter.removePosition(1);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);

    await expect(positionNFT.ownerOf(1)).to.be.revertedWith(
      'ERC721: invalid token ID',
    );

    const afterBalanceLP = await usdc.balanceOf(acc1.address);
    await expect(Number(afterBalanceLP)).to.be.greaterThan(
      Number(beforeBalanceLP),
    );

    const afterBalanceUser = await usdc.connect(acc2).balanceOf(acc2.address);
    expect(afterBalanceUser).to.be.lessThan(beforeBalanceUser);
  });

  // In this test, account1 creates position in a pool
  // Then account2 mints coverage
  // Then evm time is run up
  // Then a claim is triggered
  // Then the remainder of the position is removed
  // Then balances are checked
  it('Should create a  position successfully', async function () {
    beforeBalanceLP = await usdc.balanceOf(acc3.address);
    beforeBalanceUser = await usdc.connect(acc4).balanceOf(acc4.address);

    const position = await liquidityRouter
      .connect(acc3)
      .createPosition(
        pool.address,
        ethers.utils.parseUnits(positionAmount.toString(), 6),
        positionDuration,
      );

    const txPosition = await position.wait();
    expect(txPosition.status).to.equal(1);
    await expect(
      liquidityRouter.connect(acc3).removePosition(2),
    ).to.be.revertedWith('Position active!');
  });

  it('Should buy coverage successfully', async function () {
    const approveOther = await usdc
      .connect(acc4)
      .approve(
        pool.address,
        ethers.utils.parseUnits(positionAmount.toString(), 6),
      );
    expect(approveOther.confirmations).to.equal(1);

    const coverage = await pool
      .connect(acc4)
      .buyCoverage(
        ethers.utils.parseUnits(coverageAmount.toString(), 6),
        strike,
      );
    const txCoverage = await coverage.wait();
    expect(txCoverage.status).to.equal(1);
    await expect(await coverNFT.ownerOf(2)).to.equal(acc4.address);
  });

  it('Should run up EVM', async function () {
    const runUp = (positionDuration + 1) * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [runUp]);
    await ethers.provider.send('evm_mine', []);
  });

  it('Should trigger claim', async function () {
    await pool.resolveClaims();
  });

  it('Should remove position', async function () {
    const liquidate = await collateralizerContract.liquidatePosition(2);
    const que = await collateralizerContract.processQue();

    const remove = await liquidityRouter.connect(acc3).removePosition(2);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);

    await expect(positionNFT.ownerOf(2)).to.be.revertedWith(
      'ERC721: invalid token ID',
    );
  });

  it('Should be able to withdraw payout', async function () {
    expect(await coverNFT.ownerOf(2)).to.equal(acc4.address);
    const withdraw = await pool.connect(acc4).resolveClaim(2);
    const txWithdraw = await withdraw.wait();
    expect(txWithdraw.status).to.equal(1);
    await expect(await pool.claimEvent()).to.equal(true);
  });

  it('Should validate balances', async function () {
    const afterBalanceLP = await usdc.balanceOf(acc3.address);
    await expect(Number(afterBalanceLP)).to.be.lessThan(
      Number(beforeBalanceLP),
    );

    const afterBalanceUser = await usdc.connect(acc4).balanceOf(acc4.address);
    await expect(Number(afterBalanceUser)).to.be.greaterThan(
      Number(beforeBalanceUser),
    );
  });
});
