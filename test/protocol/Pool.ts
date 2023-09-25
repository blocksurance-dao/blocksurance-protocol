import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
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

describe('🚩 Testing pools', async function () {
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
  let oracleContract: PriceConsumerV3;
  let liquidityRouter: LIQUIDROUTER;
  let govTokenContract: GovernanceToken;
  let collateralizerContract: Collateralizer;

  const strike = 10;
  const premium = 40;
  const poolFee = 0.01;
  const positionAmount = 20000;
  const expectedLiquidity = positionAmount - positionAmount * poolFee;
  const coverageAmount = positionAmount / 4;
  const positionDuration = 366;

  const poolRole =
    '0xb8179c2726c8d8961ef054875ab3f4c1c3d34e1cb429c3d5e0bc97958e4cab9d';
  const listerRole =
    '0xf94103142c1baabe9ac2b5d1487bf783de9e69cfeea9a72f5c9c94afd7877b8c';
  const routerRole =
    '0x7a05a596cb0ce7fdea8a1e1ec73be300bdb35097c944ce1897202f7a13122eb2';
  const liquidatorRole =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';
  const riskManagerRole =
    '0xb2e3ee861706f0756afea8a5257301f83561f9ac10b8f43b771dc928566f8c61';

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
      positionDuration - 1,
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
      .connect(acc1)
      .approve(
        pool.address,
        ethers.utils.parseUnits((positionAmount * 3).toString(), 6),
      );
    expect(approve4.confirmations).to.equal(1);
  });

  it('Should set the right addresses', async function () {
    expect(await coverNFT.factory()).to.equal(factory.address);
    expect(await factory.coverNFT()).to.equal(coverNFT.address);
  });

  it('Should set the right owner', async function () {
    expect(await coverNFT.owner()).to.equal(acc1.address);
  });

  it('Should grant poolRole to acc4', async function () {
    await factory.grantRole(poolRole, acc4.address);
    expect(await factory.hasRole(poolRole, acc4.address)).to.equal(true);
  });

  it('Should revert when trying to list token without LISTER_ROLE', async function () {
    await expect(
      factory
        .connect(acc4)
        .listToken(
          'Chainlink',
          'LINK',
          link.address,
          oracleContract.address,
          'https://ipfs.io/ipfs/QmUSWtPrxDVmxt2egdErZsD7AXmFbUBQbfPpEoh1jTYXNu',
        ),
    ).to.be.revertedWith(
      'AccessControl: account 0x90f79bf6eb2c4f870365e785982e1f101e93b906 is missing role 0xf94103142c1baabe9ac2b5d1487bf783de9e69cfeea9a72f5c9c94afd7877b8c',
    );
  });

  it('Should grant LISTER_ROLE to acc4', async function () {
    await factory.grantRole(listerRole, acc4.address);
    expect(await factory.hasRole(listerRole, acc4.address)).to.equal(true);
  });

  it('Should create new pool', async function () {
    const Result = await factory.connect(acc4).createPool(
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

    const dripRes = await usdc.drip(acc1.address);
    const dripResult = await dripRes.wait();
    expect(dripResult.status).to.equal(1);

    const newRes = await usdc.approve(
      poolAddress,
      ethers.utils.parseUnits((positionAmount * 2).toString(), 6),
    );

    expect(newRes.confirmations).to.equal(1);
  });

  it('Should create a new position', async function () {
    const position = await liquidityRouter.createPosition(
      pool.address,
      ethers.utils.parseUnits(positionAmount.toString(), 6),
      positionDuration,
    );

    const txPosition = await position.wait();
    expect(txPosition.status).to.equal(1);

    await expect(await positionNFT.ownerOf(1)).to.equal(acc1.address);

    expect(await liquidityRouter.freeLiquidity(pool.address)).to.equal(
      ethers.utils.parseUnits(expectedLiquidity.toString(), 6),
    );

    await expect(liquidityRouter.removePosition(1)).to.be.revertedWith(
      'Position active!',
    );
  });

  it('Should buy coverage', async function () {
    const coverage = await pool.buyCoverage(
      ethers.utils.parseUnits(coverageAmount.toString(), 6),
      strike,
    );
    const txCoverage = await coverage.wait();
    expect(txCoverage.status).to.equal(1);

    await expect(await coverNFT.ownerOf(1)).to.equal(acc1.address);
  });

  it('Should validate the position', async function () {
    const getPOS = await liquidityRouter.getPosition(1);
    const expectedFreeLiquidity = expectedLiquidity - coverageAmount;
    await expect(Number(getPOS.freeAmount)).to.equal(
      ethers.utils.parseUnits(expectedFreeLiquidity.toString(), 6),
    );
  });

  it('Should validate coverage', async function () {
    const getCover = await pool.coverage(1);

    const cAmount = ethers.utils.parseUnits(coverageAmount.toString(), 6);
    await expect(Number(getCover.tokenId)).to.equal(1);
    await expect(Number(getCover.claim)).to.equal(0);
    await expect(Number(getCover.amount)).to.equal(cAmount);
    expect(await liquidityRouter.totalCoverage(pool.address)).to.equal(cAmount);
  });

  it('Should validate totalCoverage', async function () {
    expect(await liquidityRouter.totalCoverage(pool.address)).to.equal(
      ethers.utils.parseUnits(coverageAmount.toString(), 6),
    );
  });

  it('Should validate position count', async function () {
    expect(await liquidityRouter.poolPositionCount(pool.address)).to.equal(1);
  });

  it('Should perform Chainlink Upkeep on a Pool', async function () {
    const upkeep = await pool.checkUpkeep('0x00');
    expect(upkeep[0]).to.equal(true);
    const keeper = await pool.performUpkeep('0x00');
    const txKeeper = await keeper.wait();
    expect(txKeeper.status).to.equal(1);
  });

  it('Should validate pool name', async function () {
    expect(await pool.name()).to.equal('LINK/USDC Insurance Pool');
  });

  it('Should validate maxPoolSize', async function () {
    expect(await pool.maxPoolSize()).to.equal(
      ethers.utils.parseUnits('1000000', 6),
    );
  });

  it('Should validate pool reward', async function () {
    expect(await factory.poolReward()).to.equal(
      ethers.utils.parseUnits('5', 18),
    );
  });

  it('Should validate pool minPositionDuration', async function () {
    expect(await pool.minPositionDuration()).to.equal(positionDuration - 1);
  });

  it('Should validate free liquidity', async function () {
    expect(await liquidityRouter.freeLiquidity(pool.address)).to.equal(
      ethers.utils.parseUnits(
        (expectedLiquidity - coverageAmount).toString(),
        6,
      ),
    );
  });

  it('Should be able to change premium', async function () {
    await pool.grantRole(riskManagerRole, acc2.address);
    expect(await pool.premium()).to.equal(40);
    await pool.connect(acc2).setPremium(50);
    expect(await pool.premium()).to.equal(50);
  });
});
