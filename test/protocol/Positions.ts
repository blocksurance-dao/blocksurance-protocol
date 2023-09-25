import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { loadFixture, time } from '@nomicfoundation/hardhat-network-helpers';
import {
  InsurancePool,
  LIQUIDROUTER,
  GovernanceToken,
  Collateralizer,
} from '../../typechain-types';

describe('🚩 Testing positions', async function () {
  const poolFee = 0.01;
  const positionAmount = 20000;
  const expectedLiquidity = positionAmount - positionAmount * poolFee;
  const poolFeeAmount = positionAmount * poolFee * 10 ** 6;
  const positionDuration = 366;
  const yieldPercent = 0.04;
  const collateralizationLevel = 94;

  const routerRole =
    '0x7a05a596cb0ce7fdea8a1e1ec73be300bdb35097c944ce1897202f7a13122eb2';

  const liquidatorRole =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

  let pool: InsurancePool;
  let liquidityRouter: LIQUIDROUTER;
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;

  async function deployRequired() {
    const [owner, otherAccount] = await ethers.getSigners();
    const USDC = await ethers.getContractFactory('USDC');
    const usdc = await USDC.deploy();
    await usdc.deployed();

    const LINK = await ethers.getContractFactory('LINK');
    const link = await LINK.deploy();
    await link.deployed();

    const NFTcover = await ethers.getContractFactory('CoverageManager');
    const coverNFT = await NFTcover.deploy();
    await coverNFT.deployed();

    const NFTposition = await ethers.getContractFactory('PositionManager');
    const positionNFT = await NFTposition.deploy();
    await positionNFT.deployed();

    const FACTORY = await ethers.getContractFactory('FACTORY');
    const factory = await FACTORY.deploy();
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
    await collateralizerContract.grantRole(liquidatorRole, owner.address);

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
      //token, base, premium, maxPositionDuration
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

    return {
      usdc,
      link,
      coverNFT,
      positionNFT,
      factory,
      pool,
      owner,
      otherAccount,
    };
  }

  it('Should reset harhat server', async function () {
    await hre.network.provider.send('hardhat_reset');
  });

  it('Should be able to create and remove positions', async function () {
    const { usdc, pool, owner } = await loadFixture(deployRequired);

    await usdc.mint(owner.address, positionAmount);
    await usdc.mint(
      collateralizerContract.address,
      (positionAmount * 10) / 100,
    );

    const approve = await usdc.approve(
      liquidityRouter.address,
      ethers.utils.parseUnits(positionAmount.toString(), 6),
    );
    expect(approve.confirmations).to.equal(1);

    const beforeBalance = await usdc.balanceOf(owner.address);

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

    const uptime = positionDuration * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [uptime + 86400]);
    await ethers.provider.send('evm_mine', []);

    await collateralizerContract.liquidatePosition(1);
    await collateralizerContract.processQue();
    const remove = await liquidityRouter.removePosition(1);
    const txRemove = await remove.wait();
    expect(txRemove.status).to.equal(1);

    const afterBalanceLP = await usdc.balanceOf(owner.address);

    const collateral =
      (Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) / 99) *
      collateralizationLevel;

    const reward = (collateral * yieldPercent * positionDuration) / 365;

    const expectedBalanceLP =
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)) +
      Math.floor(reward);

    expect(Number(expectedBalanceLP)).to.equal(Number(afterBalanceLP));
  });

  it('Should verify position integrity', async function () {
    const { usdc, pool, owner } = await loadFixture(deployRequired);

    await usdc.mint(owner.address, positionAmount);
    await usdc.mint(
      collateralizerContract.address,
      (positionAmount * 10) / 100,
    );

    const approve = await usdc.approve(
      liquidityRouter.address,
      ethers.utils.parseUnits(positionAmount.toString(), 6),
    );
    expect(approve.confirmations).to.equal(1);

    const position = await liquidityRouter.createPosition(
      pool.address,
      ethers.utils.parseUnits(positionAmount.toString(), 6),
      positionDuration / 2,
    );

    const txPosition = await position.wait();
    expect(txPosition.status).to.equal(1);
    await expect(liquidityRouter.removePosition(1)).to.be.revertedWith(
      'Position active!',
    );

    const getPOS = await liquidityRouter.getPosition(1);

    expect(getPOS[0]).to.equal(1);
    expect(Number(getPOS[1])).to.equal(
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)),
    );

    expect(Number(getPOS[1])).to.equal(Number(getPOS[2]));
    const timestamp = Math.floor(
      Date.now() / 1000 + (positionDuration / 2) * 3600 * 24,
    );

    const liquidityAtExp = await liquidityRouter.getFreeLiquidity(
      pool.address,
      timestamp - 100,
    );
    expect(Number(liquidityAtExp)).to.equal(
      Number(ethers.utils.parseUnits(expectedLiquidity.toString(), 6)),
    );
  });

  it('Should run up EVM', async function () {
    const expiration = (positionDuration + 1) * 24 * 60 * 60;
    await time.increase(expiration);
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
  });

  it('Should check free liquidity', async function () {
    expect(await liquidityRouter.freeLiquidity(pool.address)).to.equal(0);
  });
});
