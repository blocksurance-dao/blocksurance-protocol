import { ethers } from "hardhat";

async function main() {
  let owner;
  [owner] = await ethers.getSigners();
  const routerRole =
    '0x7a05a596cb0ce7fdea8a1e1ec73be300bdb35097c944ce1897202f7a13122eb2';

  const liquidatorRole =
    '0x5e17fc5225d4a099df75359ce1f405503ca79498a8dc46a7d583235a0ee45c16';

  const USDC = await ethers.getContractFactory('USDC');
  const usdc = await USDC.deploy();
  await usdc.deployed();
  console.log('USDC deployed at:', usdc.address);

  const LINK = await ethers.getContractFactory('LINK');
  const link = await LINK.deploy();
  await link.deployed();
  console.log('LINK deployed at:', link.address);


  const NFTcover = await ethers.getContractFactory('CoverageManager');
  const coverNFT = await NFTcover.deploy();
  await coverNFT.deployed();
  console.log('NFT deployed at:', coverNFT.address);
  
  const NFTposition = await ethers.getContractFactory('PositionManager');
  const positionNFT = await NFTposition.deploy();
  await positionNFT.deployed();
  console.log('NFT deployed at:', positionNFT.address);

  const FACTORY = await ethers.getContractFactory('FACTORY');
  const factory = await FACTORY.deploy();

  await factory.deployed();
  console.log('FACTORY deployed at:', factory.address);

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

  const govToken = await ethers.getContractFactory('GovernanceToken');
  const govTokenContract = await govToken.deploy();
  await govTokenContract.initialize();
  const collateralizer = await ethers.getContractFactory('Collateralizer');
  const collateralizerContract = await collateralizer.deploy(usdc.address);

  const liquidity = await ethers.getContractFactory('LIQUIDROUTER');
  const liquidityRouter = await liquidity.deploy(
    factory.address,
    usdc.address,
    positionNFT.address,
    collateralizerContract.address,
  );
  console.log('LiquidityRouter deployed at:', liquidityRouter.address);
  await collateralizerContract.setRouter(liquidityRouter.address);
  await collateralizerContract.grantRole(routerRole, liquidityRouter.address);
  await collateralizerContract.grantRole(liquidatorRole, owner.address);

  await factory.initialize(
    usdc.address,
    coverNFT.address,
    liquidityRouter.address,
  );

  const ApeCoin = await ethers.getContractFactory('ApeCoin');
  const ape = await ApeCoin.deploy();
  await ape.deployed();
  console.log('APE deployed at:', ape.address);

  const ORACLE2 = await ethers.getContractFactory('PriceConsumerV3');
  const oracleContract2 = await ORACLE2.deploy();

  await factory.listToken(
    'Ape Coin',
    'APE',
    ape.address,
    oracleContract2.address,
    'https://ipfs.io/ipfs/QmcabaeFgE3ZzJjRrvgPc9c2AGT9UEHiWydkz9qj3WPWKF',
  );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
