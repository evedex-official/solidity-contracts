const { ethers } = require('ethers');
const { migration } = require('../../scripts/deploy');
const hardhat = require('hardhat');

module.exports = migration(async (deployer) => {
  const matchers = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_MATCHERS`] ?? '[]');
  const collateral = process.env[`${hardhat.network.name}_EHMARKET_COLLATERAL`];

  // limits example: '[{"limit":"1_000_000_000","userLimit":"1_000_000","timeWindow":1},{"limit":"2_000_000_000","userLimit":"2_000_000","timeWindow":2}]'
  const initialWithdrawLimits = JSON.parse(process.env[`${hardhat.network.name}_EHMARKET_WITHDRAW_LIMITS`] || '[]');

  console.log(matchers, collateral, initialWithdrawLimits);

  if (matchers.some((matcher) => !ethers.isAddress(matcher))) {
    throw new Error('Invalid matcher wallet address');
  }

  await deployer.deployProxy('contracts/ehmarket/EHMarketV2.sol:EHMarketV2', {
    name: 'EHMarket',
    args: [matchers, collateral, initialWithdrawLimits],
  });
});
module.exports.tags = ['Upgradable'];
