const { expect } = require("chai");

const vaults = 1000000;
const claimRate = 2; // % of claim events
const avgVault = 3; // ether
const avgStake = avgVault / 10; // ether
const vaultComission = avgVault * 0.015 + 0.005; // 1.5%

const avgCapital = avgStake + vaultComission;
const totalCapital = vaults * avgCapital;
console.log("total capital", totalCapital);

// claim exposure
const requiredClaim = (vaults * avgVault * 0.98 * claimRate) / 100;
console.log("claims exposure", requiredClaim);
// stake exposure
const requiredStake = vaults * avgStake * 1.49;
console.log("stake exposure", requiredStake);

const totalRequired = requiredClaim + requiredStake;
const multiplier = totalRequired / totalCapital;
console.log("cap to payout ratio", multiplier);

it("Multiplier", async function () {
  expect(totalRequired).to.equal(totalCapital * multiplier);
});

// 42% return on capital to break even at 1% claim rate;
// 45% return on capital to break even at 2% claim rate;
