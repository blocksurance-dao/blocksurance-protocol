import hre from 'hardhat';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { it, describe } from 'mocha';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('🚩 Testing:  Governance Token', function () {
  this.timeout(45000);

  let msgSender: any;
  let govtokenContract: any;
  let minStakeAmount = 10000000;

  it('Should set env vars', async function () {
    await hre.network.provider.send('hardhat_reset');
    const [owner] = await ethers.getSigners();
    msgSender = owner.address;
  });



  it('Should deploy Governance Token', async function () {
    const govToken = await ethers.getContractFactory('GovernanceToken');
    govtokenContract = await govToken.deploy({ gasLimit: 30000000 });
    await govtokenContract.initialize();

    expect(ethers.utils.isAddress(await govtokenContract.address)).to.be.equal(
      true,
    );
  });

  describe('Token', function () {
    it('You should be able to airdrop tokens', async function () {
      const [owner, acc1] = await ethers.getSigners();
      const airResult = await govtokenContract.airdrop(
        [owner.address, acc1.address],
        ethers.utils.parseEther((minStakeAmount * 3).toString()),
      );

      const txResult = await airResult.wait();
      expect(txResult.status).to.equal(1);
    });
  });

  describe('Staker', function () {
    // ################**STAKER**################ //

    it('Should be able to set minimalStake variable', async () => {
      expect(await govtokenContract.getMinStake()).to.equal(
        ethers.utils.parseEther(minStakeAmount.toString()),
      );
      await govtokenContract.setMinStake(ethers.utils.parseEther('30000'));
      expect(await govtokenContract.getMinStake()).to.equal(
        ethers.utils.parseEther('30000'),
      );
      await govtokenContract.setMinStake(
        ethers.utils.parseEther(minStakeAmount.toString()),
      );
      expect(await govtokenContract.getMinStake()).to.equal(
        ethers.utils.parseEther(minStakeAmount.toString()),
      );
    });

    it('Should be able to set MaxStakingPeriod variable', async () => {
      expect(await govtokenContract.maxStakingPeriod()).to.equal(450);
      await govtokenContract.setMaxStakingPeriod(390);
      expect(await govtokenContract.maxStakingPeriod()).to.equal(390);
      await govtokenContract.setMaxStakingPeriod(450);
      expect(await govtokenContract.maxStakingPeriod()).to.equal(450);
    });

    it('Should be able to set rates variable', async () => {
      expect((await govtokenContract.getRates())[0]).to.equal(8);
      await govtokenContract.setRates(22, 34, 55);
      expect((await govtokenContract.getRates())[2]).to.equal(55);
      await govtokenContract.setRates(21, 33, 45);
      expect((await govtokenContract.getRates())[0]).to.equal(21);
    });

    it('Staking should fail after it is paused', async function () {
      await govtokenContract.approve(
        govtokenContract.address,
        ethers.utils.parseEther(minStakeAmount.toString()),
      );

      await govtokenContract.stakingEnabled(false);

      await expect(
        govtokenContract.stakeTokens(
          ethers.utils.parseEther(minStakeAmount.toString()),
          90,
        ),
      ).to.be.revertedWith('Staking is temporarily halted!');

      await govtokenContract.stakingEnabled(true);
    });

    it('Stake should go up when you stake', async function () {
      const [owner, acc1] = await ethers.getSigners();
      await govtokenContract
        .connect(acc1)
        .approve(
          govtokenContract.address,
          ethers.utils.parseEther(minStakeAmount.toString()),
        );

      const startingStake = await govtokenContract.getUserStake(acc1.address);
      const refBalance1 = await govtokenContract.balanceOf(acc1.address);

      const stakeResult = await govtokenContract
        .connect(acc1)
        .stakeTokens(ethers.utils.parseEther(minStakeAmount.toString()), 90);

      const txResult = await stakeResult.wait();
      expect(txResult.status).to.equal(1);

      const endingStake = await govtokenContract.getUserStake(acc1.address);

      expect(endingStake.amount).to.equal(
        startingStake.amount.add(
          ethers.utils.parseEther(minStakeAmount.toString()),
        ),
      );

      const refBalance2 = await govtokenContract.balanceOf(acc1.address);
      expect(refBalance2).to.equal(
        refBalance1.sub(ethers.utils.parseEther(minStakeAmount.toString())),
      );
    });

    it('Should fail when trying to burn stake before lockup expires', async function () {
      const [owner, acc1] = await ethers.getSigners();
      await expect(
        govtokenContract.connect(acc1).exitStake(acc1.address),
      ).to.be.revertedWith('Lockup period not over!');
    });

    it('Should fail when trying to burn non existent stake ', async function () {
      await expect(govtokenContract.exitStake(msgSender)).to.be.revertedWith(
        "You don't have a stake!",
      );
    });

    it('Should retrieve active stakes from contract', async function () {
      const txResult = await govtokenContract.getActiveStakers();
      expect(txResult.length).to.equal(1);
    });

    it('Should be able to exit stake', async function () {
      const approveResult = await govtokenContract.approve(
        govtokenContract.address,
        ethers.utils.parseEther(minStakeAmount.toString()),
      );
      const txResult4 = await approveResult.wait();
      expect(txResult4.status).to.equal(1);

      const stakeResult = await govtokenContract.stakeTokens(
        ethers.utils.parseEther(minStakeAmount.toString()),
        270,
      );

      const txResult5 = await stakeResult.wait();
      expect(txResult5.status).to.equal(1);

      const txResult = await govtokenContract.getActiveStakers();
      expect(txResult.length).to.equal(2);

      const startingStake = await govtokenContract.getUserStake(msgSender);

      expect(startingStake.amount).to.equal(
        ethers.utils.parseEther(minStakeAmount.toString()),
      );

      const runUp = 270 * 24 * 60 * 60;
      await time.increase(runUp);
      const burnResult1 = await govtokenContract.exitStake(msgSender);
      const txResult6 = await burnResult1.wait();
      expect(txResult6.status).to.equal(1);
      const endingStake = await govtokenContract.getUserStake(msgSender);
      expect(endingStake.amount).to.equal(0);
    });

    it('Owner should be able to set min Stake amount', async function () {
      await govtokenContract.setMinStake(ethers.utils.parseEther('50000'));
      const getResult = await govtokenContract.getMinStake();
      expect(getResult).to.equal(ethers.utils.parseEther('50000'));
      // ################**RESET**################ //
      await hre.network.provider.send('hardhat_reset');
    });
  });
});
